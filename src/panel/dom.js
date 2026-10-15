// Small helpers for the panel's page, and the primitives of design/ux-proposals.html that the panel builds.
import { buildSvg } from "../graph/svg.js";
import { storageKeys } from "../shared/storage.js";

/** @typedef {{ variant?: "plain" | "primary" | "quiet" | "danger", isSmall?: boolean, icon?: string, label?: string, title?: string, onClick: (event: Event) => void }} ButtonParts */

/** @typedef {{ tone?: string, lead?: Node, caption: string, name: string, extra?: Node[], trail?: Node[], isOff?: boolean, isEmpty?: boolean, hook?: string }} StackRowParts */

/** @typedef {{ name: string, detail: string, badge?: Node, isPlaying?: () => boolean, onPick: () => void, onRemove?: () => void }} ListRowParts */

// A Library section is a layer role or "sets".
/** @typedef {string} SectionName */

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
export const byId = (id) => document.getElementById(id);

// The Library has one section per layer and one for the Sets. Each section uses the same class names inside.
/**
 * @param {SectionName} section
 * @returns {HTMLElement}
 */
export const sectionOf = (section) => document.querySelector(`.preset-section[data-role="${section}"]`);

/**
 * @param {SectionName} section
 * @param {string} name
 * @returns {HTMLElement}
 */
export const partOf = (section, name) => sectionOf(section).querySelector(`.${name}`);

// The panel's one way to build an element, as buildSvg is the graph's. Other keys are element properties.
/**
 * @param {string} tag
 * @param {{ text?: string | number, style?: Partial<CSSStyleDeclaration>, dataset?: Record<string, string | number>, on?: Record<string, (event: Event) => void>, [property: string]: unknown }} [options]
 * @param {(Node | string)[]} [children]
 * @returns {HTMLElement}
 */
export function buildElement(tag, options = {}, children = []) {
  const { text = "", style = {}, dataset = {}, on = {}, ...properties } = options;
  const element = document.createElement(tag);

  Object.assign(element, properties);
  Object.assign(element.style, style);

  for (const [key, value] of Object.entries(dataset)) element.dataset[key] = String(value);

  for (const [type, listener] of Object.entries(on)) element.addEventListener(type, listener);

  if (text !== "") element.textContent = text;

  element.append(...children);

  return element;
}

// An icon is a symbol in src/panel.html, such as icon-close.
/**
 * @param {string} name
 * @returns {SVGElement}
 */
export function buildIcon(name) {
  return buildSvg("svg", { class: "ui-icon", ariaHidden: "true" }, [buildSvg("use", { href: `#icon-${name}` })]);
}

// One button in four variants. A button with an icon and no label is square and takes its title as its name.
/**
 * @param {ButtonParts} parts
 * @returns {HTMLElement}
 */
export function buildButton({ variant = "plain", isSmall = false, icon = "", label = "", title = "", onClick }) {
  const classNames = ["ui-button", `ui-button--${variant}`];
  const children = [];

  if (isSmall) classNames.push("ui-button--small");
  if (icon) children.push(buildIcon(icon));
  if (label) children.push(buildElement("span", { text: label }));
  if (icon && !label) classNames.push("ui-button--icon");

  const name = label ? {} : { ariaLabel: title };

  return buildElement("button", { type: "button", className: classNames.join(" "), title, ...name, on: { click: onClick } }, children);
}

// The row of the layer stack and of the current sound. A tone gives it a bar in that colour.
/**
 * @param {StackRowParts} parts
 * @returns {HTMLElement}
 */
export function buildStackRow({ tone = "", lead, caption, name, extra = [], trail = [], isOff = false, isEmpty = false, hook = "" }) {
  const classNames = ["ui-stack-row"];
  const children = [];

  if (tone) classNames.push("has-bar", tone);
  if (isOff) classNames.push("is-off");
  if (isEmpty) classNames.push("is-empty");
  if (hook) classNames.push(hook);
  if (lead) children.push(lead);

  const texts = [buildElement("span", { className: "ui-stack-row__caption", text: caption }), buildElement("span", { className: "ui-stack-row__name", text: name })];

  children.push(buildElement("span", { className: "ui-stack-row__body" }, [...texts, ...extra]));

  if (trail.length > 0) children.push(buildElement("span", { className: "ui-stack-row__trail" }, trail));

  return buildElement("div", { className: classNames.join(" ") }, children);
}

// Each list row that can play keeps its own test, so a redraw marks the rows in place.
const playingTests = new WeakMap();

// The row of a Library list. The press plays it, and the × in its trail deletes it.
/**
 * @param {ListRowParts} parts
 * @returns {HTMLElement}
 */
export function buildListRow({ name, detail, badge, isPlaying, onPick, onRemove }) {
  const nameParts = [buildElement("span", { text: name })];

  if (badge) nameParts.push(badge);

  const text = buildElement("span", { className: "ui-list-row__text" }, [
    buildElement("span", { className: "ui-list-row__name" }, nameParts),
    buildElement("span", { className: "ui-list-row__detail", text: detail }),
  ]);
  const main = buildElement("button", { type: "button", className: "ui-list-row__main item", dataset: { name }, on: { click: onPick } }, [text]);
  const children = [main];

  if (onRemove) {
    const remove = buildButton({ variant: "quiet", isSmall: true, icon: "close", title: `Delete ${name}`, onClick: onRemove });

    children.push(buildElement("span", { className: "ui-list-row__trail" }, [remove]));
  }

  const row = buildElement("div", { className: "ui-list-row" }, children);

  if (isPlaying) playingTests.set(row, isPlaying);

  return row;
}

// The row of the sound that plays is marked, for the eye and for a screen reader.
/** @param {HTMLElement} list */
export function renderPlayingRows(list) {
  for (const row of list.querySelectorAll(".ui-list-row")) {
    const isPlaying = playingTests.has(row) && playingTests.get(row)();

    row.classList.toggle("is-selected", isPlaying);
    row.firstElementChild.setAttribute("aria-current", String(isPlaying));
  }
}

function readFocusPath(container) {
  const path = [];

  if (!container.contains(document.activeElement)) return path;

  for (let element = document.activeElement; element !== container; element = element.parentElement) {
    path.unshift([...element.parentElement.children].indexOf(element));
  }

  return path;
}

const drawnKeys = new WeakMap();

// A redraw with the same data keeps the elements. A real redraw gives the focus to the element in the same place.
/**
 * @param {HTMLElement} container
 * @param {string} drawnKey
 * @param {() => Node[]} buildChildren
 */
export function renderChildren(container, drawnKey, buildChildren) {
  if (drawnKeys.get(container) === drawnKey) return;

  const focusPath = readFocusPath(container);
  let focused = container;

  drawnKeys.set(container, drawnKey);
  container.replaceChildren(...buildChildren());

  for (const index of focusPath) focused = focused && focused.children[index];

  if (focused && focused !== container) focused.focus();
}

// The eyebrow that names a group, with its count and a hairline.
/**
 * @param {{ label: string, count?: number, tone?: string }} parts
 * @returns {HTMLElement}
 */
export function buildSectionHeader({ label, count, tone = "" }) {
  const children = [buildElement("span", { text: label })];

  if (count !== undefined) children.push(buildElement("span", { className: "ui-section-header__count", text: String(count) }));

  children.push(buildElement("span", { className: "ui-section-header__rule" }));

  return buildElement("div", { className: `ui-section-header ui-section-header--eyebrow ${tone}` }, children);
}

// Marks the current item of a set of tabs or of a segmented control. The key is the data attribute that names each item.
/**
 * @param {HTMLElement} group
 * @param {string} key
 * @param {string} value
 */
export function markCurrent(group, key, value) {
  for (const item of group.querySelectorAll(`[data-${key}]`)) {
    const isCurrent = item.dataset[key] === value;
    const stateName = item.getAttribute("role") === "tab" ? "aria-selected" : "aria-checked";

    item.classList.toggle("is-current", isCurrent);
    item.setAttribute(stateName, String(isCurrent));
  }
}

/**
 * @param {() => void} run
 * @param {number} waitMs
 * @returns {() => void}
 */
export function debounce(run, waitMs) {
  let timer = 0;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(run, waitMs);
  };
}

// An alert, such as a missing name, shows in the danger colour.
/**
 * @param {SectionName} section
 * @param {string} text
 * @param {boolean} [isAlert]
 */
export function showHint(section, text, isAlert = false) {
  const hint = partOf(section, "action-hint");

  hint.textContent = text;
  hint.classList.toggle("tone-danger", isAlert);
}

/**
 * @param {SectionName} section
 * @returns {string}
 */
export function readSaveName(section) {
  return partOf(section, "save-name").value.trim();
}

// The button reads Replace while the typed name is already in the list.
/**
 * @param {SectionName} section
 * @param {(name: string) => boolean} hasName
 */
export function renderSaveLabel(section, hasName) {
  partOf(section, "confirm-save").textContent = hasName(readSaveName(section)) ? "Replace" : "Save";
}

/** @typedef {{ hasName: (name: string) => boolean, save: (name: string) => void, emptyHint: string, onInput?: () => void }} SaveRowParts */

/**
 * @param {SectionName} section
 * @param {SaveRowParts} parts
 */
function confirmSave(section, { save, emptyHint }) {
  const name = readSaveName(section);

  if (name) save(name);
  else showHint(section, emptyHint, true);
}

// The name field and button of a save row. Enter saves too, and an empty name gets an alert.
/**
 * @param {SectionName} section
 * @param {SaveRowParts} parts
 */
export function wireSaveRow(section, parts) {
  const { hasName, onInput = () => {} } = parts;

  partOf(section, "confirm-save").addEventListener("click", () => confirmSave(section, parts));
  partOf(section, "save-name").addEventListener("input", () => {
    renderSaveLabel(section, hasName);
    onInput();
  });
  partOf(section, "save-name").addEventListener("keydown", (event) => {
    if (event.key === "Enter") confirmSave(section, parts);
  });
}

// An export box is as tall as its text, so every line shows. The box must be on the page to measure.
/**
 * @param {HTMLTextAreaElement} box
 * @param {string} text
 */
export function showAllLines(box, text) {
  box.value = text;
  box.style.minHeight = "0";
  box.style.height = "auto";
  box.style.height = `${box.scrollHeight + box.offsetHeight - box.clientHeight}px`;
}

// A paste box goes back to the height the stylesheet gives it.
/** @param {HTMLTextAreaElement} box */
export function resetBoxHeight(box) {
  box.style.minHeight = "";
  box.style.height = "";
}

// A field the person is typing in keeps their text.
/**
 * @param {string} id
 * @param {string | number} value
 */
export function setField(id, value) {
  const field = byId(id);

  if (field !== document.activeElement) field.value = value;
}

// The panel tabs and the Library tabs. Each set shows one pane through its host's data-showing, and the panel opens on it next time.
const tabSets = {
  tab: { tabsId: "tabs", hostId: "app", storageKey: storageKeys.tab },
  role: { tabsId: "libraryTabs", hostId: "library", storageKey: storageKeys.libraryRole },
};

/**
 * @param {"tab" | "role"} key
 * @param {string} value
 */
export function showTab(key, value) {
  const tabSet = tabSets[key];

  byId(tabSet.hostId).dataset.showing = value;
  markCurrent(byId(tabSet.tabsId), key, value);
  chrome.storage.local.set({ [tabSet.storageKey]: value });
}

/** @returns {void} */
export function wireTabs() {
  for (const key of Object.keys(tabSets)) {
    byId(tabSets[key].tabsId).addEventListener("click", (event) => {
      const tab = event.target.closest(`[data-${key}]`);

      if (tab) showTab(key, tab.dataset[key]);
    });
  }
}

// Change on Listen, Add and Save as Set open one section of the Library.
/** @param {SectionName} section */
export function openLibrarySection(section) {
  showTab("tab", "library");
  showTab("role", section);
  sectionOf(section).scrollIntoView({ block: "start" });
}

// The Library actions: save, import, paste, export and the EQByEar test, and the ear and taste lists.
import { autoPreampDb } from "../shared/bands.js";
import { emptyLayerNames, layerLabels, layerOrder, layerSources } from "../shared/config.js";
import { parseAutoEq, toAutoEq } from "../autoeq.js";
import { byId, buildElement, buildIcon, buildListRow, debounce, partOf, renderSaveLabel, resetBoxHeight, sectionOf, showAllLines, showHint, wireSaveRow } from "./dom.js";
import { renderHeadphoneList } from "./headphones.js";
import { appendSection, describeBandCount } from "./items.js";
import { isSavedPreset, buildPresetItem, renderPresetCards, storePresets } from "./presets.js";
import { onPresetsChange } from "./refresh.js";
import { commit, readBands, removeLayer, replaceLayer } from "./sound.js";
import { state } from "./state.js";

/** @typedef {import("../shared/config.js").LayerRole} LayerRole */

// The words of each layer's section. The ear and taste lists end with a row that takes the layer off.
const sectionWords = {
  headphone: {
    caption: "Makes your headphone sound neutral. Find it in AutoEQ below, then save it as your own preset.",
    pasted: "Pasted headphone",
    pasteTitle: "Paste AutoEQ text into the headphone layer",
    pastePlaceholder: "Paste AutoEQ text here",
  },
  ear: {
    caption: "Tunes the sound to your own hearing, on top of the headphone. Measure it with the EQByEar test, paste the result here, then save it.",
    pasted: "Pasted ear tuning",
    pasteTitle: "Paste AutoEQ text, such as an EQByEar result, into the ear layer",
    pastePlaceholder: "Paste the EQByEar result here",
    heading: "Your ear presets",
    empty: "Nothing saved yet. Run the test, paste the result, then press Save.",
    offCaption: "Headphone only",
  },
  taste: {
    caption: "Your own flavour, on top of your ear. Add bands in Tune, or paste AutoEQ text here, then save it.",
    pasted: "Pasted taste",
    pasteTitle: "Paste AutoEQ text into the taste layer",
    pastePlaceholder: "Paste AutoEQ text here",
    heading: "Your taste presets",
    empty: "Nothing saved yet. Add bands in Tune, or paste AutoEQ text, then press Save.",
    offCaption: "Headphone and ear only",
  },
};
const typingPauseMs = 150;

/**
 * @param {string} action
 * @param {string} label
 * @param {{ className?: string, title?: string }} [options]
 * @returns {HTMLElement}
 */
function buildActionButton(action, label, { className = "", title = "" } = {}) {
  return buildElement("button", { type: "button", className: `ui-button ui-button--small ${className}`, title, dataset: { action }, text: label });
}

function buildMeasureButton() {
  const title = "Open eqbyear.com in a new tab, with My ear off, to measure your ear";

  return buildElement("button", { type: "button", id: "eqbyear", className: "ui-button ui-button--wide", title, dataset: { action: "measure" } }, [
    buildIcon("external"),
    buildElement("span", { text: "Measure my ear with EQByEar" }),
  ]);
}

function buildSearch() {
  const placeholder = "Search AutoEQ or your presets, for example HD 600";
  const field = buildElement("input", { type: "search", className: "ui-field__control search", placeholder });

  return buildElement("label", { className: "ui-field ui-field--search" }, [buildIcon("search"), field]);
}

function buildSectionHead(role) {
  const tone = `tone-${role}`;
  const text = buildElement("span", { className: "ui-section-header__text" }, [
    buildElement("span", { className: "ui-section-header__title", text: layerLabels[role] }),
    buildElement("span", { className: "ui-section-header__caption", text: sectionWords[role].caption }),
  ]);

  return buildElement("div", { className: `ui-section-header ui-section-header--section ${tone}` }, [
    buildElement("span", { className: `ui-badge ui-badge--step ${tone}`, text: layerOrder.indexOf(role) + 1 }),
    text,
  ]);
}

function buildCurrentRow(role) {
  const body = buildElement("span", { className: "ui-stack-row__body" }, [
    buildElement("span", { className: "ui-stack-row__caption current-caption" }),
    buildElement("span", { className: "ui-stack-row__name current-name" }),
  ]);
  const trail = buildElement("span", { className: "ui-stack-row__trail" }, [
    buildActionButton("save", "Save", { className: "ui-button--primary save" }),
    buildActionButton("saveAs", "Save as new", { className: "save-as", title: "Keep this as a new preset under another name" }),
  ]);

  return buildElement("div", { className: `ui-stack-row has-bar tone-${role} current` }, [body, trail]);
}

function buildSaveRow(role) {
  const name = buildElement("input", { type: "text", className: "ui-field__control save-name", placeholder: `Name for this ${role} preset` });
  const confirm = buildElement("button", { type: "button", className: "ui-button ui-button--primary ui-button--small confirm-save", text: "Save" });
  const row = buildElement("div", { className: "ui-cluster ui-cluster--fill" }, [buildElement("label", { className: "ui-field" }, [name]), confirm]);

  return buildElement("div", { className: "ui-expander ui-expander--drawer save-row", hidden: true }, [row]);
}

function buildActionRows(role) {
  const words = sectionWords[role];
  const buttons = buildElement("div", { className: "ui-grid library-actions" }, [
    buildActionButton("import", "Import", { title: `Load a ParametricEQ.txt file into the ${role} layer` }),
    buildActionButton("paste", "Paste", { title: words.pasteTitle }),
    buildActionButton("export", "Export", { title: `Copy the ${role} layer as AutoEQ text` }),
  ]);
  const drawer = buildElement("div", { className: "ui-expander ui-expander--drawer drawer", hidden: true }, [
    buildElement("textarea", { className: "ui-field ui-field--area text", spellcheck: false, placeholder: words.pastePlaceholder }),
    buildActionButton("apply", "Apply", { className: "ui-button--primary pn-drawer-apply apply" }),
  ]);
  const file = buildElement("input", { type: "file", className: "import-file", accept: ".txt,text/plain", hidden: true });

  return [buttons, drawer, file, buildElement("p", { className: "ui-text-hint action-hint" })];
}

// The three layer sections differ only in their role and words. The headphone has the search, and My ear has the test.
function buildLayerSection(role) {
  const children = [buildSectionHead(role), buildCurrentRow(role), buildSaveRow(role)];

  if (role === "ear") children.push(buildMeasureButton());

  children.push(...buildActionRows(role));

  if (role === "headphone") children.push(buildSearch());

  children.push(buildElement("div", { className: "pn-results results" }));

  if (role === "headphone") children.push(buildElement("p", { className: "ui-text-hint search-hint" }));

  return buildElement("div", { className: "pn-section preset-section ui-stack", dataset: { role } }, children);
}

// The Sets section is written in src/panel.html. The layer sections go in front of it.
/** @returns {void} */
export function renderLibrarySections() {
  byId("library").prepend(...layerOrder.map(buildLayerSection));
}

/**
 * @param {LayerRole} role
 * @param {string} name
 */
function savePreset(role, name) {
  const layer = state.config.layers[role];
  const isUpdate = Object.hasOwn(state.presets[role], name);

  state.presets[role][name] = { bands: structuredClone(layer.bands) };
  layer.name = name;
  layer.source = layerSources.saved;
  layer.isEdited = false;

  closeLibraryAction(role);
  commit();
  storePresets(role);
  showHint(role, `${isUpdate ? "Updated" : "Saved"} ${name}.`);
}

/** @param {"ear" | "taste"} role */
function renderLayerList(role) {
  const words = sectionWords[role];
  const list = partOf(role, "results");
  const items = Object.keys(state.presets[role]).map((name) => buildPresetItem(role, name, () => {}));

  if (items.length === 0) items.push(buildElement("p", { className: "ui-text-hint", text: words.empty }));

  const isOff = () => !state.config.layers[role] || !state.config.layers[role].on;
  const turnOff = buildListRow({ name: emptyLayerNames[role], detail: words.offCaption, isPlaying: isOff, onPick: () => removeLayer(role) });

  list.replaceChildren();
  appendSection(list, words.heading, items);
  list.append(turnOff);
  renderPresetCards();
}

/** @returns {void} */
export function renderLayerLists() {
  renderLayerList("ear");
  renderLayerList("taste");
}

/**
 * @param {LayerRole} role
 * @param {string} text
 * @param {string} name
 * @param {string} source
 */
function applyAutoEqText(role, text, name, source) {
  const parsed = parseAutoEq(text);

  if (parsed.bands.length === 0) {
    showHint(role, "No AutoEQ filters found in that text.", true);
    return;
  }

  replaceLayer(role, { name, source, bands: parsed.bands, preampDb: parsed.preampDb });
  showHint(role, `Applied ${describeBandCount(parsed.bands)} to ${layerLabels[role]}. Press Save to keep it.`);
}

/**
 * @param {LayerRole} role
 * @returns {(name: string) => boolean}
 */
function hasPresetIn(role) {
  return (name) => Object.hasOwn(state.presets[role], name);
}

/**
 * @param {LayerRole} role
 * @param {string} action
 */
function fillSaveName(role, action) {
  // Save fills in the current name, so an AutoEQ pick saves under its headphone name.
  partOf(role, "save-name").value = action === "save" ? state.config.layers[role].name : "";
  renderSaveLabel(role, hasPresetIn(role));
  partOf(role, "save-name").focus();
}

function fillExportText(role) {
  const bands = readBands(state.config.layers[role]);

  showAllLines(partOf(role, "text"), toAutoEq({ preampDb: autoPreampDb(bands), bands }));
  showHint(role, `${layerLabels[role]} alone, as AutoEQ text. Copy it out.`);
}

function emptyPasteBox(role) {
  const text = partOf(role, "text");

  text.value = "";
  resetBoxHeight(text);
  text.focus();
}

const fillActionRow = { save: fillSaveName, saveAs: fillSaveName, export: fillExportText, paste: emptyPasteBox };

// Each section button opens its own row. A second press on the same button closes it.
/**
 * @param {LayerRole} role
 * @param {string} action
 */
export function toggleLibraryAction(role, action) {
  const openAction = state.openActions[role] === action ? "" : action;

  state.openActions[role] = openAction;
  partOf(role, "save-row").hidden = openAction !== "save" && openAction !== "saveAs";
  partOf(role, "drawer").hidden = openAction !== "paste" && openAction !== "export";
  partOf(role, "apply").hidden = openAction !== "paste";

  for (const button of partOf(role, "library-actions").children) button.classList.toggle("is-on", button.dataset.action === openAction);

  showHint(role, "");

  if (openAction) fillActionRow[openAction](role, openAction);
}

function closeLibraryAction(role) {
  if (state.openActions[role]) toggleLibraryAction(role, state.openActions[role]);
}

const libraryActions = {
  save: (role) => {
    if (isSavedPreset(role)) savePreset(role, state.config.layers[role].name);
    else toggleLibraryAction(role, "save");
  },
  saveAs: (role) => toggleLibraryAction(role, "saveAs"),
  import: (role) => partOf(role, "import-file").click(),
  paste: (role) => toggleLibraryAction(role, "paste"),
  export: (role) => toggleLibraryAction(role, "export"),
  apply: (role) => applyAutoEqText(role, partOf(role, "text").value, sectionWords[role].pasted, layerSources.pasted),
  // The test measures what you hear, so My ear comes off first. The headphone layer stays on.
  measure: () => {
    if (state.config.layers.ear) state.config.layers.ear.on = false;

    commit();
    chrome.tabs.create({ url: "https://eqbyear.com" });
  },
};

async function importFile(role, file) {
  const dot = file.name.lastIndexOf(".");
  const name = dot > 0 ? file.name.slice(0, dot) : file.name;

  applyAutoEqText(role, await file.text(), name, layerSources.file);
}

/** @returns {void} */
export function wireLibrary() {
  for (const role of layerOrder) {
    sectionOf(role).addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");

      if (button) libraryActions[button.dataset.action](role);
    });
    wireSaveRow(role, { hasName: hasPresetIn(role), save: (name) => savePreset(role, name), emptyHint: "Give the preset a name first." });
    partOf(role, "import-file").addEventListener("change", (event) => {
      const [file] = event.target.files;

      event.target.value = "";

      if (file) importFile(role, file);
    });
  }

  partOf("headphone", "search").addEventListener("input", debounce(renderHeadphoneList, typingPauseMs));
}

onPresetsChange("ear", () => renderLayerList("ear"));
onPresetsChange("taste", () => renderLayerList("taste"));

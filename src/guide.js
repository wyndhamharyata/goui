// The three Get started steps, for the how-to page and for the panel before goui first hears a tab.
import { buildElement, buildIcon } from "./panel/dom.js";

const iconPath = "../icons/icon32.png";

const startSteps = [
  ["pin", "Pin goui", "Press the puzzle piece in the toolbar. Pin goui so it stays one click away."],
  ["play", "Play something", "Open any tab that plays audio."],
  ["click", "Click the goui icon", "goui hears that tab. The icon shows a green ON."],
];

// A picture holds no real controls, so its buttons are spans with the Button look.
/**
 * @param {string} icon
 * @param {boolean} isPressed
 * @returns {HTMLElement}
 */
function buildPictureButton(icon, isPressed) {
  const className = isPressed ? "ui-button ui-button--quiet ui-button--small ui-button--icon is-on guide-press" : "ui-button ui-button--quiet ui-button--small ui-button--icon";

  return buildElement("span", { className }, [buildIcon(icon)]);
}

/** @returns {HTMLElement} */
function buildAddressBar() {
  const field = buildElement("input", { className: "ui-field__control", value: "radio.example.com", readOnly: true, tabIndex: -1 });

  return buildElement("label", { className: "ui-field ui-field--readonly" }, [field]);
}

function buildGouiIcon() {
  const badge = buildElement("span", { className: "ui-badge ui-badge--pill tone-good" }, [buildElement("span", { text: "ON" })]);

  return buildElement("span", { className: "guide-shot__goui guide-press" }, [buildElement("img", { src: iconPath, alt: "", width: 16, height: 16 }), badge]);
}

function buildMenuRow() {
  const lead = buildElement("img", { src: iconPath, alt: "", width: 14, height: 14 });
  const text = buildElement("span", { className: "ui-list-row__text" }, [buildElement("span", { className: "ui-list-row__name" }, [buildElement("span", { text: "goui" })])]);
  const main = buildElement("span", { className: "ui-list-row__main" }, [lead, text]);
  const trail = buildElement("span", { className: "ui-list-row__trail" }, [buildPictureButton("pin", true)]);

  return buildElement("div", { className: "guide-shot__menu" }, [buildElement("div", { className: "ui-list-row ui-list-row--dense" }, [main, trail])]);
}

/**
 * @param {string} label
 * @param {string} icon
 * @param {boolean} isOn
 * @returns {HTMLElement}
 */
function buildBrowserTab(label, icon, isOn) {
  const children = [buildElement("span", { text: label })];

  if (icon) children.unshift(buildIcon(icon));

  return buildElement("span", { className: isOn ? "ui-chip ui-chip--tag is-on" : "ui-chip ui-chip--tag" }, children);
}

function buildCursor() {
  const cursor = buildIcon("cursor");

  cursor.classList.add("guide-shot__cursor");

  return cursor;
}

const shotBuilders = {
  pin: () => [buildAddressBar(), buildPictureButton("puzzle", true), buildMenuRow()],
  play: () => [buildElement("span", { className: "ui-cluster" }, [buildBrowserTab("Lofi radio", "speaker", true), buildBrowserTab("Mail", "", false)]), buildAddressBar()],
  click: () => [buildAddressBar(), buildGouiIcon(), buildPictureButton("puzzle", false), buildCursor()],
};

function buildStepHeader(number, title, text) {
  const badge = buildElement("span", { className: "ui-badge ui-badge--step tone-accent", text: number });
  const words = buildElement("span", { className: "ui-section-header__text" }, [
    buildElement("span", { className: "ui-section-header__title", text: title }),
    buildElement("span", { className: "ui-section-header__caption", text }),
  ]);

  return buildElement("div", { className: "ui-section-header ui-section-header--section tone-accent" }, [badge, words]);
}

// Each step is a Section header over its picture. The picture is hidden from a screen reader, since the header says it all.
/**
 * @param {number} number
 * @param {string} title
 * @param {string} text
 * @param {Node[]} shotParts
 * @returns {HTMLElement}
 */
export function buildGuideStep(number, title, text, shotParts) {
  const shot = buildElement("div", { className: "guide-shot", ariaHidden: "true" }, shotParts);

  return buildElement("li", { className: "guide-step" }, [buildStepHeader(number, title, text), shot]);
}

/** @returns {HTMLElement[]} */
export function buildStartSteps() {
  return startSteps.map(([key, title, text], index) => buildGuideStep(index + 1, title, text, shotBuilders[key]()));
}

// The Get started steps for the Mac, in place of the extension's steps about the toolbar and tabs. Every picture is built from the panel's primitives.
import { buildGuideStep } from "../../src/guide.js";
import { buildElement, buildIcon } from "../../src/panel/dom.js";

const exampleSetName = "HD 600 home";

// A picture holds no real controls, so its buttons are spans with the Button look.
/**
 * @param {string} className
 * @param {(Node | string)[]} children
 * @returns {HTMLElement}
 */
function buildPictureButton(className, children) {
  return buildElement("span", { className: `ui-button ui-button--small ${className}` }, children);
}

/**
 * @param {string} text
 * @param {string} className
 * @returns {HTMLElement}
 */
function buildPictureField(text, className) {
  const field = buildElement("input", { className: "ui-field__control", value: text, readOnly: true, tabIndex: -1 });

  return buildElement("label", { className: `ui-field ${className}` }, [field]);
}

// A dense list row that shows a thing to press, with no press of its own.
/**
 * @param {{ name: string, detail?: string, icon?: string, isSelected?: boolean }} parts
 * @returns {HTMLElement}
 */
function buildPictureRow({ name, detail = "", icon = "", isSelected = false }) {
  const texts = [buildElement("span", { className: "ui-list-row__name" }, [buildElement("span", { text: name })])];
  const children = [];

  if (detail) texts.push(buildElement("span", { className: "ui-list-row__detail", text: detail }));
  if (icon) children.push(buildIcon(icon));

  children.push(buildElement("span", { className: "ui-list-row__text" }, texts));

  return buildElement("div", { className: isSelected ? "ui-list-row ui-list-row--dense is-selected" : "ui-list-row ui-list-row--dense" }, [
    buildElement("span", { className: "ui-list-row__main" }, children),
  ]);
}

/**
 * @param {Node[]} children
 * @returns {HTMLElement}
 */
function buildPictureMenu(children) {
  return buildElement("div", { className: "guide-shot__menu" }, children);
}

function buildPowerShot() {
  return [buildPictureButton("tone-good guide-press", [buildIcon("power"), "OFF"]), buildPictureField("goui is off", "ui-field--readonly")];
}

function buildAllowShot() {
  const buttons = buildElement("span", { className: "ui-cluster" }, [
    buildPictureButton("ui-button--plain", ["Don't Allow"]),
    buildPictureButton("ui-button--primary guide-press", ["Allow"]),
  ]);

  return [buildPictureMenu([buildElement("p", { className: "ui-text-hint", text: "goui would like to record the audio of this Mac." }), buttons])];
}

function buildPlayShot() {
  return [buildPictureMenu([buildPictureRow({ name: "Lofi radio", detail: "Music", icon: "speaker" }), buildPictureRow({ name: "Weekly sync", detail: "Zoom", icon: "speaker" })])];
}

function buildMenuShot() {
  return [buildPictureMenu([buildPictureRow({ name: exampleSetName, isSelected: true }), buildPictureRow({ name: "Office speakers" }), buildPictureRow({ name: "Wide panel" })])];
}

function buildCommandShot() {
  return [buildPictureField(`goui set "${exampleSetName}"`, "ui-field--readonly ui-field--code")];
}

/** @returns {void} */
export function renderMacGuide() {
  document.getElementById("guideSteps").replaceChildren(
    buildGuideStep(1, "Turn goui on", "Press the power button at the top of this panel. goui EQs every sound the Mac plays.", buildPowerShot()),
    buildGuideStep(2, "Allow the audio", "The first time, macOS asks to let goui record the audio of this Mac. Press Allow. goui EQs the sound on its way to you and keeps none of it.", buildAllowShot()),
    buildGuideStep(3, "Play something", "Any app works. Music, a video, a call.", buildPlayShot()),
    buildGuideStep(4, "Right-click the menu bar item", "The menu holds your Sets, Wide panel, Restart engine and Reload panel. A pick from Sets plays it with the panel closed.", buildMenuShot()),
    buildGuideStep(5, "Switch Sets from Terminal", `Save a Set under Library, then Sets. goui set "${exampleSetName}" plays it from Terminal, a shortcut or a login item.`, buildCommandShot()),
  );
}

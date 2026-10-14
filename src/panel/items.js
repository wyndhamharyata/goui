// The rows of the Library lists.
import { makeElement } from "./dom.js";

/** @typedef {import("../shared/bands.js").Band} Band */

/** @typedef {import("../shared/config.js").Layer} Layer */

/**
 * @param {Band[]} bands
 * @returns {string}
 */
export function describeBandCount(bands) {
  return bands.length === 1 ? "1 band" : `${bands.length} bands`;
}

/**
 * @param {string} label
 * @param {string} detail
 * @param {() => void} onPick
 * @param {() => void} [onRemove]
 * @returns {HTMLElement}
 */
export function makeResultItem(label, detail, onPick, onRemove) {
  const button = makeElement("button", { className: "item" });
  button.dataset.name = label;
  button.append(makeElement("span", { text: label }), makeElement("small", { text: detail }));
  button.addEventListener("click", onPick);
  if (!onRemove) return button;

  const remove = makeElement("button", { className: "remove", text: "×", title: `Delete ${label}` });
  remove.addEventListener("click", onRemove);
  const row = makeElement("div", { className: "result-row" });
  row.append(button, remove);

  return row;
}

/**
 * @param {HTMLElement} list
 * @param {string} title
 * @param {HTMLElement[]} items
 */
export function appendSection(list, title, items) {
  if (items.length === 0) return;
  list.append(makeElement("h4", { text: title }), ...items);
}

/**
 * @param {Layer} layer
 * @returns {string}
 */
export function describeLayerName(layer) {
  return layer.isEdited ? `${layer.name}, edited` : layer.name;
}

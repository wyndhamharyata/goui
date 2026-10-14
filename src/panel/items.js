// The rows of the Library lists.
import { buildElement } from "./dom.js";

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
export function buildResultItem(label, detail, onPick, onRemove) {
  const labels = [buildElement("span", { text: label }), buildElement("small", { text: detail })];
  const button = buildElement("button", { className: "item", dataset: { name: label }, on: { click: onPick } }, labels);

  if (!onRemove) return button;

  const remove = buildElement("button", { className: "remove", text: "×", title: `Delete ${label}`, on: { click: onRemove } });

  return buildElement("div", { className: "result-row" }, [button, remove]);
}

/**
 * @param {HTMLElement} list
 * @param {string} title
 * @param {HTMLElement[]} items
 */
export function appendSection(list, title, items) {
  if (items.length === 0) return;

  list.append(buildElement("h4", { text: title }), ...items);
}

/**
 * @param {Layer} layer
 * @returns {string}
 */
export function describeLayerName(layer) {
  return layer.isEdited ? `${layer.name}, edited` : layer.name;
}

// The groups of the Library lists, and the words their rows show.
import { buildElement, buildSectionHeader } from "./dom.js";

/** @typedef {import("../shared/bands.js").Band} Band */

/** @typedef {import("../shared/config.js").Layer} Layer */

/**
 * @param {Band[]} bands
 * @returns {string}
 */
export function describeBandCount(bands) {
  return bands.length === 1 ? "1 band" : `${bands.length} bands`;
}

// A group shows its rows under an eyebrow. A hint in their place, such as "Nothing saved yet", does not stop the group. No items build no group.
/**
 * @param {string} title
 * @param {HTMLElement[]} items
 * @returns {HTMLElement[]}
 */
export function buildListGroup(title, items) {
  if (items.length === 0) return [];

  return [buildElement("div", { className: "ui-stack ui-stack--tight" }, [buildSectionHeader({ label: title }), ...items])];
}

/**
 * @param {HTMLElement} list
 * @param {string} title
 * @param {HTMLElement[]} items
 */
export function appendSection(list, title, items) {
  list.append(...buildListGroup(title, items));
}

/**
 * @param {Layer} layer
 * @returns {string}
 */
export function describeLayerName(layer) {
  return layer.isEdited ? `${layer.name}, edited` : layer.name;
}

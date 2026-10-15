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

// A group counts its rows. A hint in their place, such as "Nothing saved yet", does not count.
/**
 * @param {HTMLElement} list
 * @param {string} title
 * @param {HTMLElement[]} items
 */
export function appendSection(list, title, items) {
  if (items.length === 0) return;

  const count = items.filter((item) => item.classList.contains("ui-list-row")).length;

  list.append(buildElement("div", { className: "ui-stack ui-stack--tight" }, [buildSectionHeader({ label: title, count }), ...items]));
}

/**
 * @param {Layer} layer
 * @returns {string}
 */
export function describeLayerName(layer) {
  return layer.isEdited ? `${layer.name}, edited` : layer.name;
}

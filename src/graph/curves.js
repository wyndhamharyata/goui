// The total curve, the red and blue areas under it, and each layer's dashed curve.
import { responseDb } from "../shared/bands.js";
import { layerColor } from "./colors.js";
import { drawArea, drawCurve } from "./svg.js";

/** @typedef {import("./view.js").View} View */

/** @typedef {import("../shared/config.js").LayerBands} LayerBands */

// Boosts fill red and cuts fill blue.
/**
 * @param {View} view
 * @param {Float32Array} frequencies
 * @param {Float32Array} curveDb
 * @returns {string}
 */
export function drawLoudness(view, frequencies, curveDb) {
  const boostDb = curveDb.map((valueDb) => Math.max(valueDb, 0));
  const cutDb = curveDb.map((valueDb) => Math.min(valueDb, 0));
  return drawArea(view, frequencies, boostDb, `fill="rgba(255,122,144,0.24)"`) + drawArea(view, frequencies, cutDb, `fill="rgba(79,163,255,0.24)"`);
}

// Each layer's own curve, dashed, under the solid total.
/**
 * @param {View} view
 * @param {Float32Array} frequencies
 * @param {LayerBands[]} layers
 * @returns {string}
 */
export function drawLayerCurves(view, frequencies, layers) {
  return layers.map((layer) => {
    const stroke = `stroke="${layerColor[layer.role]}" stroke-width="1.5" stroke-dasharray="4 3"`;
    return drawCurve(view, frequencies, responseDb(layer.bands, frequencies), stroke);
  }).join("");
}

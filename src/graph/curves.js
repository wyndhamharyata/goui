// The red and blue areas under the curve, and each layer's dashed curve.
import { responseDb } from "../shared/bands.js";
import { boostAreaStyle, cutAreaStyle, layerCurveStyle } from "./styles.js";
import { drawArea, drawCurve } from "./svg.js";

/** @typedef {import("./view.js").View} View */

/** @typedef {import("../shared/config.js").LayerBands} LayerBands */

/**
 * @param {View} view
 * @param {Float32Array} frequencies
 * @param {Float32Array} curveDb
 * @returns {SVGElement[]}
 */
export function drawLoudness(view, frequencies, curveDb) {
  const boostDb = curveDb.map((valueDb) => Math.max(valueDb, 0));
  const cutDb = curveDb.map((valueDb) => Math.min(valueDb, 0));

  return [drawArea(view, frequencies, boostDb, boostAreaStyle), drawArea(view, frequencies, cutDb, cutAreaStyle)];
}

/**
 * @param {View} view
 * @param {Float32Array} frequencies
 * @param {LayerBands[]} layers
 * @returns {SVGElement[]}
 */
export function drawLayerCurves(view, frequencies, layers) {
  return layers.map((layer) => drawCurve(view, frequencies, responseDb(layer.bands, frequencies), layerCurveStyle(layer.role)));
}

// Where a frequency and a gain fall on the plot, for the zoom and the turn in a view.
import { frequencyRangeHz, hasGain, sweepPointCount } from "../shared/bands.js";
import { clamp, logInterpolate, logPosition } from "../shared/math.js";

/** @typedef {import("../shared/bands.js").Band} Band */

/** @typedef {{ x: number, y: number }} Point */

/** @typedef {{ width: number, height: number, left: number, top: number, plotWidth: number, plotHeight: number }} PlotSize */

// The drawing is plain functions of a view: the zoom, the turn and the plot size. Only EqGraph holds state.
/** @typedef {{ zoom: string, isTall: boolean, size: PlotSize }} View */

// The graph shows ±15 dB. A band beyond that draws at the edge.
export const maxShownGainDb = 15;
export const zooms = { all: frequencyRangeHz, lows: [20, 400], mids: [200, 5000], highs: [2000, 20_000] };

// A band with no gain draws its point on the 0 dB line.
/**
 * @param {Band} band
 * @returns {number}
 */
export function drawnGainDb(band) {
  return hasGain(band.type) ? band.gainDb : 0;
}

/**
 * @param {View} view
 * @param {number} frequencyHz
 * @returns {number}
 */
export function frequencyToRatio(view, frequencyHz) {
  const [lowHz, highHz] = zooms[view.zoom];
  return logPosition(frequencyHz, lowHz, highHz);
}

/**
 * @param {View} view
 * @param {number} ratio
 * @returns {number}
 */
function ratioToFrequency(view, ratio) {
  const [lowHz, highHz] = zooms[view.zoom];
  return clamp(logInterpolate(lowHz, highHz, ratio), ...frequencyRangeHz);
}

// Frequency runs along the plot and gain across it, so a wide graph has frequency on x and a tall one on y.
/**
 * @param {View} view
 * @param {number} frequencyHz
 * @param {number} gainDb
 * @returns {Point}
 */
export function placePoint(view, frequencyHz, gainDb) {
  const { size } = view;
  const along = frequencyToRatio(view, frequencyHz);
  const across = (clamp(gainDb, -maxShownGainDb, maxShownGainDb) + maxShownGainDb) / (2 * maxShownGainDb);
  if (view.isTall) return { x: size.left + (across * size.plotWidth), y: size.top + (along * size.plotHeight) };

  return { x: size.left + (along * size.plotWidth), y: size.top + ((1 - across) * size.plotHeight) };
}

/**
 * @param {View} view
 * @param {number} x
 * @param {number} y
 * @returns {{ frequencyHz: number, gainDb: number }}
 */
export function readPoint(view, x, y) {
  const { size } = view;
  const along = view.isTall ? (y - size.top) / size.plotHeight : (x - size.left) / size.plotWidth;
  const across = view.isTall ? (x - size.left) / size.plotWidth : 1 - ((y - size.top) / size.plotHeight);
  const gainDb = clamp((across * 2 * maxShownGainDb) - maxShownGainDb, -maxShownGainDb, maxShownGainDb);

  return { frequencyHz: ratioToFrequency(view, along), gainDb };
}

/**
 * @param {View} view
 * @param {number} frequencyHz
 * @returns {Point[]}
 */
export function findGainAxisEnds(view, frequencyHz) {
  return [placePoint(view, frequencyHz, -maxShownGainDb), placePoint(view, frequencyHz, maxShownGainDb)];
}

/**
 * @param {View} view
 * @returns {Float32Array}
 */
export function sweepFrequencies(view) {
  return Float32Array.from({ length: sweepPointCount }, (_, index) => ratioToFrequency(view, index / (sweepPointCount - 1)));
}

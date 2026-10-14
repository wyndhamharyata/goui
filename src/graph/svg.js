// The SVG pieces every part of the graph draws with.
import { placePoint } from "./view.js";

/** @typedef {import("./view.js").View} View */

/** @typedef {import("./view.js").Point} Point */

/**
 * @param {Point} from
 * @param {Point} to
 * @param {string} style
 * @returns {string}
 */
export function makeLine(from, to, style) {
  return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" ${style}/>`;
}

/**
 * @param {Point} point
 * @param {string} content
 * @param {string} style
 * @returns {string}
 */
export function makeText(point, content, style) {
  return `<text x="${point.x}" y="${point.y}" fill="rgba(255,255,255,0.45)" font-size="9" ${style}>${content}</text>`;
}

/**
 * @param {View} view
 * @param {Float32Array} frequencies
 * @param {ArrayLike<number>} valuesDb
 * @returns {string[]}
 */
function tracePoints(view, frequencies, valuesDb) {
  return Array.from(frequencies, (frequencyHz, index) => {
    const point = placePoint(view, frequencyHz, valuesDb[index]);
    return `${point.x},${point.y}`;
  });
}

// The area between the 0 dB line and a curve.
/**
 * @param {View} view
 * @param {Float32Array} frequencies
 * @param {ArrayLike<number>} valuesDb
 * @param {string} fill
 * @returns {string}
 */
export function drawArea(view, frequencies, valuesDb, fill) {
  const start = placePoint(view, frequencies[0], 0);
  const end = placePoint(view, frequencies.at(-1), 0);
  const edge = tracePoints(view, frequencies, valuesDb);

  return `<polygon points="${start.x},${start.y} ${edge.join(" ")} ${end.x},${end.y}" ${fill}/>`;
}

/**
 * @param {View} view
 * @param {Float32Array} frequencies
 * @param {ArrayLike<number>} valuesDb
 * @param {string} stroke
 * @returns {string}
 */
export function drawCurve(view, frequencies, valuesDb, stroke) {
  return `<polyline points="${tracePoints(view, frequencies, valuesDb).join(" ")}" fill="none" ${stroke}/>`;
}

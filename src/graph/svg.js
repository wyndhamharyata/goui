// Builds the graph as SVG elements. Attributes are written in camelCase, as in JSX.
import { placePoint } from "./view.js";

/** @typedef {import("./view.js").View} View */

/** @typedef {import("./view.js").Point} Point */

/** @typedef {Record<string, string | number>} SvgAttributes */

/** @typedef {{ x: number, y: number, width: number, height: number }} Box */

const svgNamespace = "http://www.w3.org/2000/svg";
// SVG spells these attributes in camelCase itself. Every other camelCase name becomes kebab-case.
const camelCaseAttributes = new Set(["viewBox"]);

function toAttributeName(name) {
  if (camelCaseAttributes.has(name)) return name;

  return name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * @param {string} tag
 * @param {SvgAttributes} [attributes]
 * @param {(SVGElement | string)[]} [children]
 * @returns {SVGElement}
 */
export function buildSvg(tag, attributes = {}, children = []) {
  const element = document.createElementNS(svgNamespace, tag);

  for (const [name, value] of Object.entries(attributes)) element.setAttribute(toAttributeName(name), String(value));

  element.append(...children);

  return element;
}

/**
 * @param {Point} from
 * @param {Point} to
 * @param {SvgAttributes} style
 * @returns {SVGElement}
 */
export function buildLine(from, to, style) {
  return buildSvg("line", { x1: from.x, y1: from.y, x2: to.x, y2: to.y, ...style });
}

/**
 * @param {Point} point
 * @param {string} content
 * @param {SvgAttributes} style
 * @returns {SVGElement}
 */
export function buildText(point, content, style) {
  return buildSvg("text", { x: point.x, y: point.y, ...style }, [content]);
}

/**
 * @param {Box} box
 * @param {SvgAttributes} style
 * @returns {SVGElement}
 */
export function buildRect(box, style) {
  return buildSvg("rect", { ...box, ...style });
}

/**
 * @param {Point} center
 * @param {number} radius
 * @param {SvgAttributes} style
 * @returns {SVGElement}
 */
export function buildCircle(center, radius, style) {
  return buildSvg("circle", { cx: center.x, cy: center.y, r: radius, ...style });
}

/**
 * @param {Point[]} points
 * @param {SvgAttributes} style
 * @returns {SVGElement}
 */
export function buildPolygon(points, style) {
  return buildSvg("polygon", { points: points.map((point) => `${point.x},${point.y}`).join(" "), ...style });
}

/**
 * @param {View} view
 * @param {Float32Array} frequencies
 * @param {ArrayLike<number>} valuesDb
 * @returns {Point[]}
 */
function tracePoints(view, frequencies, valuesDb) {
  return Array.from(frequencies, (frequencyHz, index) => placePoint(view, frequencyHz, valuesDb[index]));
}

// The area between the 0 dB line and a curve.
/**
 * @param {View} view
 * @param {Float32Array} frequencies
 * @param {ArrayLike<number>} valuesDb
 * @param {SvgAttributes} style
 * @returns {SVGElement}
 */
export function drawArea(view, frequencies, valuesDb, style) {
  const start = placePoint(view, frequencies[0], 0);
  const end = placePoint(view, frequencies.at(-1), 0);

  return buildPolygon([start, ...tracePoints(view, frequencies, valuesDb), end], style);
}

/**
 * @param {View} view
 * @param {Float32Array} frequencies
 * @param {ArrayLike<number>} valuesDb
 * @param {SvgAttributes} style
 * @returns {SVGElement}
 */
export function drawCurve(view, frequencies, valuesDb, style) {
  const points = tracePoints(view, frequencies, valuesDb).map((point) => `${point.x},${point.y}`).join(" ");
  return buildSvg("polyline", { points, fill: "none", ...style });
}

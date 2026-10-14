// Every look the graph draws with, as SVG attributes for makeSvg.
import { backgroundColor, curveColor, layerColor, textColor, typeColor } from "./colors.js";

/** @typedef {import("./svg.js").SvgAttributes} SvgAttributes */

/** @typedef {import("../shared/bands.js").Band} Band */

/** @typedef {import("../shared/bands.js").BandType} BandType */

/** @typedef {import("../shared/config.js").LayerRole} LayerRole */

/**
 * @param {number} opacity
 * @returns {string}
 */
function white(opacity) {
  return `rgba(255,255,255,${opacity})`;
}

export const regionStyles = { even: { fill: "rgba(0,0,0,0)" }, odd: { fill: white(0.025) } };
export const regionLabelStyle = { fill: white(0.45), fontSize: 9, fillOpacity: 0.8 };

export const gridLabelStyle = { fill: white(0.45), fontSize: 9 };
export const strongGridLineStyle = { stroke: white(0.13) };
export const faintGridLineStyle = { stroke: white(0.05) };
export const zeroGainLineStyle = { stroke: white(0.22) };

export const spectrumStyle = { fill: "rgba(150,165,200,0.13)" };
export const boostAreaStyle = { fill: "rgba(255,122,144,0.24)" };
export const cutAreaStyle = { fill: "rgba(79,163,255,0.24)" };

export const curveStyle = { stroke: curveColor, strokeWidth: 2 };
// With the EQ off, the curve turns grey and stays in place.
export const offCurveStyle = { stroke: white(0.35), strokeWidth: 2 };

/**
 * @param {LayerRole} role
 * @returns {SvgAttributes}
 */
export function layerCurveStyle(role) {
  return { stroke: layerColor[role], strokeWidth: 1.5, strokeDasharray: "4 3" };
}

/**
 * @param {BandType} type
 * @returns {SvgAttributes}
 */
export function chosenAreaStyle(type) {
  return { fill: typeColor[type], fillOpacity: 0.18 };
}

export const qGuideStyle = { stroke: typeColor.PK, strokeOpacity: 0.55, strokeDasharray: "3 3" };
export const qHandleStyle = { rx: 2, fill: backgroundColor, stroke: typeColor.PK, strokeWidth: 2 };

// A band that is off draws hollow, in the background colour.
/**
 * @param {Band} band
 * @returns {SvgAttributes}
 */
export function bandPointStyle(band) {
  return { fill: band.on ? typeColor[band.type] : backgroundColor, stroke: typeColor[band.type], strokeWidth: 1.5 };
}

export const chosenRingStyle = { fill: "none", stroke: "#fff", strokeOpacity: 0.7 };
export const earRingStyle = { fill: "none", stroke: layerColor.ear, strokeWidth: 1.5 };
export const bandNumberStyle = { textAnchor: "middle", fontSize: 9, fontWeight: 700, fill: backgroundColor };

/**
 * @param {BandType} type
 * @returns {SvgAttributes}
 */
export function bandLabelBoxStyle(type) {
  return { rx: 8, fill: backgroundColor, stroke: typeColor[type] };
}

export const bandLabelTextStyle = { textAnchor: "middle", fontSize: 9.5, fill: textColor };

export const hoverLineStyle = { stroke: white(0.25) };
export const hoverDotStyle = { fill: "#fff" };
export const hoverBoxStyle = { rx: 4, fill: "rgba(14,16,19,0.9)" };
export const hoverTextStyle = { fontSize: 9.5, fill: textColor };

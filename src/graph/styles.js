// Every look the graph draws with, as SVG attributes for buildSvg. Each class is a rule in src/panel.css that reads the tokens.
import { layerTone, typeTone } from "./colors.js";

/** @typedef {import("./svg.js").SvgAttributes} SvgAttributes */

/** @typedef {import("../shared/bands.js").Band} Band */

/** @typedef {import("../shared/bands.js").BandType} BandType */

/** @typedef {import("../shared/config.js").LayerRole} LayerRole */

export const regionStyles = { even: { class: "plot-region" }, odd: { class: "plot-region is-alternate" } };
export const regionLabelStyle = { class: "plot-label" };

export const gridLabelStyle = { class: "plot-label" };
export const strongGridLineStyle = { class: "plot-grid is-major" };
export const faintGridLineStyle = { class: "plot-grid" };
export const zeroGainLineStyle = { class: "plot-grid is-zero" };

export const spectrumStyle = { class: "plot-spectrum" };
export const boostAreaStyle = { class: "plot-louder" };
export const cutAreaStyle = { class: "plot-quieter" };

// The curve is the accent. With the EQ off, it turns grey and dotted and stays in place.
export const curveStyle = { class: "plot-curve" };
export const offCurveStyle = { class: "plot-curve is-off" };

/**
 * @param {LayerRole} role
 * @returns {SvgAttributes}
 */
export function layerCurveStyle(role) {
  return { class: `plot-layer ${layerTone[role]}` };
}

/**
 * @param {BandType} type
 * @returns {SvgAttributes}
 */
export function chosenAreaStyle(type) {
  return { class: `plot-band-area ${typeTone[type]}` };
}

export const qGuideStyle = { class: `plot-q-line ${typeTone.PK}` };
export const qHandleStyle = { rx: 2, class: `plot-q-handle ${typeTone.PK}` };

// A band that is off draws hollow.
/**
 * @param {Band} band
 * @returns {SvgAttributes}
 */
export function bandPointStyle(band) {
  const offClass = band.on ? "" : " is-off";

  return { class: `plot-point ${typeTone[band.type]}${offClass}` };
}

export const chosenRingStyle = { class: "plot-chosen" };
// A ring in the layer's colour marks the points of the layers on top of the headphone.
export const layerRingStyle = {
  ear: { class: `plot-ring ${layerTone.ear}` },
  taste: { class: `plot-ring ${layerTone.taste}` },
};
export const bandNumberStyle = { textAnchor: "middle", class: "plot-number" };

/**
 * @param {BandType} type
 * @returns {SvgAttributes}
 */
export function bandLabelBoxStyle(type) {
  return { rx: 8, class: `plot-pill ${typeTone[type]}` };
}

export const bandLabelTextStyle = { textAnchor: "middle", class: "plot-pill-text" };

export const hoverLineStyle = { class: "plot-hover" };
export const hoverDotStyle = { class: "plot-hover-dot" };
export const hoverBoxStyle = { rx: 4, class: "plot-readout" };
export const hoverTextStyle = { class: "plot-pill-text" };

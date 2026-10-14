// The region bands, the frequency lines and the gain lines behind the curve.
import { formatHz } from "./format.js";
import { makeLine, makeText } from "./svg.js";
import { findGainAxisEnds, frequencyToRatio, maxShownGainDb, placePoint, zooms } from "./view.js";

/** @typedef {import("./view.js").View} View */

const ticksHz = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000];
const majorTicksHz = [100, 1000, 10_000];

const regions = [
  { lowHz: 20, highHz: 60, name: "Sub" },
  { lowHz: 60, highHz: 250, name: "Bass" },
  { lowHz: 250, highHz: 500, name: "Low mids" },
  { lowHz: 500, highHz: 2000, name: "Mids" },
  { lowHz: 2000, highHz: 6000, name: "Presence" },
  { lowHz: 6000, highHz: 20_000, name: "Treble" },
];

/**
 * @param {View} view
 * @returns {string}
 */
export function drawRegions(view) {
  const { size } = view;
  const [firstHz, lastHz] = zooms[view.zoom];
  return regions.map((region, index) => {
    const start = placePoint(view, Math.max(region.lowHz, firstHz), maxShownGainDb);
    const end = placePoint(view, Math.min(region.highHz, lastHz), -maxShownGainDb);
    const length = view.isTall ? end.y - start.y : end.x - start.x;
    if (length <= 0) return "";
    const fill = index % 2 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0)";
    const rect = view.isTall
      ? `<rect x="${size.left}" y="${start.y}" width="${size.plotWidth}" height="${length}" fill="${fill}"/>`
      : `<rect x="${start.x}" y="${size.top}" width="${length}" height="${size.plotHeight}" fill="${fill}"/>`;
    const minLabelLengthPx = 40;
    if (length < minLabelLengthPx) return rect;
    const tallSpot = { x: size.left + size.plotWidth - 4, y: start.y + (length / 2) + 3 };
    const wideSpot = { x: start.x + (length / 2), y: size.top + 10 };
    const anchor = view.isTall ? "end" : "middle";
    return rect + makeText(view.isTall ? tallSpot : wideSpot, region.name, `text-anchor="${anchor}" fill-opacity="0.8"`);
  }).join("");
}

/**
 * @param {View} view
 * @returns {string}
 */
export function drawFrequencyGrid(view) {
  const parts = [];
  let lastLabelAt = -Infinity;
  for (const frequencyHz of ticksHz) {
    const ratio = frequencyToRatio(view, frequencyHz);
    const isInView = ratio > -0.001 && ratio < 1.001;
    if (!isInView) continue;
    const [low, high] = findGainAxisEnds(view, frequencyHz);
    const opacity = majorTicksHz.includes(frequencyHz) ? 0.13 : 0.05;
    parts.push(makeLine(low, high, `stroke="rgba(255,255,255,${opacity})"`));
    const labelAt = view.isTall ? low.y : low.x;
    const minLabelSpacingPx = 26;
    if (labelAt - lastLabelAt < minLabelSpacingPx) continue;
    lastLabelAt = labelAt;
    const spot = view.isTall ? { x: 4, y: low.y + 3 } : { x: low.x, y: view.size.height - 4 };
    parts.push(makeText(spot, formatHz(frequencyHz), `text-anchor="${view.isTall ? "start" : "middle"}"`));
  }

  return parts.join("");
}

/**
 * @param {View} view
 * @returns {string}
 */
export function drawGainGrid(view) {
  const [firstHz, lastHz] = zooms[view.zoom];
  const parts = [];
  for (const gainDb of [-12, -6, 0, 6, 12]) {
    const from = placePoint(view, firstHz, gainDb);
    const to = placePoint(view, lastHz, gainDb);
    parts.push(makeLine(from, to, `stroke="rgba(255,255,255,${gainDb === 0 ? 0.22 : 0.05})"`));
    const spot = view.isTall ? { x: from.x, y: 11 } : { x: 4, y: from.y + 3 };
    parts.push(makeText(spot, gainDb > 0 ? `+${gainDb}` : `${gainDb}`, `text-anchor="${view.isTall ? "middle" : "start"}"`));
  }

  return parts.join("");
}

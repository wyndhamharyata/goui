// The region bands, the frequency lines and the gain lines behind the curve.
import { formatHz } from "./format.js";
import {
  gridLabelStyle,
  majorGridLineStyle,
  minorGridLineStyle,
  regionLabelStyle,
  regionStyles,
  zeroLineStyle,
} from "./styles.js";
import { makeLine, makeRect, makeText } from "./svg.js";
import { findGainAxisEnds, frequencyToRatio, maxShownGainDb, placePoint, zooms } from "./view.js";

/** @typedef {import("./view.js").View} View */

const ticksHz = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000];
const majorTicksHz = [100, 1000, 10_000];
const gainLinesDb = [-12, -6, 0, 6, 12];
const minLabelLengthPx = 40;
const minLabelSpacingPx = 26;

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
 * @param {{ lowHz: number, highHz: number, name: string }} region
 * @param {number} index
 * @returns {SVGElement[]}
 */
function drawRegion(view, region, index) {
  const { size } = view;
  const [firstHz, lastHz] = zooms[view.zoom];
  const start = placePoint(view, Math.max(region.lowHz, firstHz), maxShownGainDb);
  const end = placePoint(view, Math.min(region.highHz, lastHz), -maxShownGainDb);
  const length = view.isTall ? end.y - start.y : end.x - start.x;
  if (length <= 0) return [];

  const style = index % 2 ? regionStyles.odd : regionStyles.even;
  const tallBox = { x: size.left, y: start.y, width: size.plotWidth, height: length };
  const wideBox = { x: start.x, y: size.top, width: length, height: size.plotHeight };
  const band = makeRect(view.isTall ? tallBox : wideBox, style);
  if (length < minLabelLengthPx) return [band];

  const tallSpot = { x: size.left + size.plotWidth - 4, y: start.y + (length / 2) + 3 };
  const wideSpot = { x: start.x + (length / 2), y: size.top + 10 };
  const labelStyle = { ...regionLabelStyle, textAnchor: view.isTall ? "end" : "middle" };

  return [band, makeText(view.isTall ? tallSpot : wideSpot, region.name, labelStyle)];
}

/**
 * @param {View} view
 * @returns {SVGElement[]}
 */
export function drawRegions(view) {
  return regions.flatMap((region, index) => drawRegion(view, region, index));
}

/**
 * @param {View} view
 * @returns {SVGElement[]}
 */
export function drawFrequencyGrid(view) {
  const elements = [];
  const labelStyle = { ...gridLabelStyle, textAnchor: view.isTall ? "start" : "middle" };
  let lastLabelAt = -Infinity;
  for (const frequencyHz of ticksHz) {
    const ratio = frequencyToRatio(view, frequencyHz);
    const isInView = ratio > -0.001 && ratio < 1.001;
    if (!isInView) continue;

    const [low, high] = findGainAxisEnds(view, frequencyHz);
    elements.push(makeLine(low, high, majorTicksHz.includes(frequencyHz) ? majorGridLineStyle : minorGridLineStyle));
    const labelAt = view.isTall ? low.y : low.x;
    if (labelAt - lastLabelAt < minLabelSpacingPx) continue;

    lastLabelAt = labelAt;
    const spot = view.isTall ? { x: 4, y: low.y + 3 } : { x: low.x, y: view.size.height - 4 };
    elements.push(makeText(spot, formatHz(frequencyHz), labelStyle));
  }

  return elements;
}

/**
 * @param {View} view
 * @returns {SVGElement[]}
 */
export function drawGainGrid(view) {
  const [firstHz, lastHz] = zooms[view.zoom];
  const labelStyle = { ...gridLabelStyle, textAnchor: view.isTall ? "middle" : "start" };
  return gainLinesDb.flatMap((gainDb) => {
    const from = placePoint(view, firstHz, gainDb);
    const to = placePoint(view, lastHz, gainDb);
    const spot = view.isTall ? { x: from.x, y: 11 } : { x: 4, y: from.y + 3 };
    const label = gainDb > 0 ? `+${gainDb}` : `${gainDb}`;

    return [makeLine(from, to, gainDb === 0 ? zeroLineStyle : minorGridLineStyle), makeText(spot, label, labelStyle)];
  });
}

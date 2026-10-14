// The band points, the chosen band with its Q handles and label, and the reading under the pointer.
import { hasGain, responseDb } from "../shared/bands.js";
import { clamp, octavesToRatio, qToOctaves } from "../shared/math.js";
import { formatDb, formatHz } from "./format.js";
import {
  bandLabelBoxStyle,
  bandLabelTextStyle,
  bandNumberStyle,
  bandPointStyle,
  chosenAreaStyle,
  chosenRingStyle,
  earRingStyle,
  hoverBoxStyle,
  hoverDotStyle,
  hoverLineStyle,
  hoverTextStyle,
  qGuideStyle,
  qHandleStyle,
} from "./styles.js";
import { drawArea, makeCircle, makeLine, makeRect, makeText } from "./svg.js";
import { drawnGainDb, findGainAxisEnds, placePoint, readPoint } from "./view.js";

/** @typedef {import("../shared/bands.js").Band} Band */

/** @typedef {import("./view.js").View} View */

/** @typedef {import("./view.js").Point} Point */

/** @typedef {import("./graph.js").BandEntry} BandEntry */

// Where a band's point is drawn, with its place in the band list.
/** @typedef {{ index: number, x: number, y: number }} BandPoint */

// The width of one character of the 9.5 px label text, to size the box around a label.
const charWidthPx = 5.6;
const qHandleSizePx = 10;
const bandPointRadiusPx = 7;

// A chosen peak gets two square Q handles, half its width out on each side.
/**
 * @param {View} view
 * @param {Band} band
 * @param {Float32Array} frequencies
 * @returns {{ elements: SVGElement[], qHandles: Point[] }}
 */
export function drawChosenBand(view, band, frequencies) {
  const alone = [{ ...band, on: true }];
  const area = drawArea(view, frequencies, responseDb(alone, frequencies), chosenAreaStyle(band.type));
  if (band.type !== "PK") return { elements: [area], qHandles: [] };

  const halfOctaves = qToOctaves(band.q) / 2;
  const sidesHz = Float32Array.from([-1, 1], (side) => band.frequencyHz * octavesToRatio(side * halfOctaves));
  const sidesDb = responseDb(alone, sidesHz);
  const elements = [area];
  const qHandles = [];
  sidesHz.forEach((frequencyHz, index) => {
    const [low, high] = findGainAxisEnds(view, frequencyHz);
    const handle = placePoint(view, frequencyHz, sidesDb[index]);
    const box = { x: handle.x - (qHandleSizePx / 2), y: handle.y - (qHandleSizePx / 2), width: qHandleSizePx, height: qHandleSizePx };
    elements.push(makeLine(low, high, qGuideStyle), makeRect(box, qHandleStyle));
    qHandles.push(handle);
  });

  return { elements, qHandles };
}

/**
 * @param {View} view
 * @param {BandEntry[]} entries
 * @param {number} chosenIndex
 * @returns {{ elements: SVGElement[], points: BandPoint[] }}
 */
export function drawBandPoints(view, entries, chosenIndex) {
  const elements = [];
  const points = [];
  entries.forEach(({ role, band }, index) => {
    const point = placePoint(view, band.frequencyHz, drawnGainDb(band));
    points.push({ index, ...point });
    if (role === "ear") elements.push(makeCircle(point, 9.5, earRingStyle));
    if (index === chosenIndex) elements.push(makeCircle(point, 11, chosenRingStyle));
    elements.push(makeCircle(point, bandPointRadiusPx, bandPointStyle(band)));
    elements.push(makeText({ x: point.x, y: point.y + 3 }, `${index + 1}`, bandNumberStyle));
  });

  return { elements, points };
}

// The label above the chosen point, with its frequency, gain and Q.
/**
 * @param {View} view
 * @param {Band} band
 * @returns {SVGElement[]}
 */
export function drawBandLabel(view, band) {
  const { size } = view;
  const point = placePoint(view, band.frequencyHz, drawnGainDb(band));
  const gain = hasGain(band.type) ? `${formatDb(band.gainDb)} dB  ` : "";
  const content = `${formatHz(band.frequencyHz)} Hz  ${gain}Q ${band.q.toFixed(2)}`;
  const width = (content.length * charWidthPx) + 12;
  const x = clamp(point.x - (width / 2), 2, size.width - width - 2);
  const y = point.y > size.top + 30 ? point.y - 30 : point.y + 16;

  return [
    makeRect({ x, y, width, height: 16 }, bandLabelBoxStyle(band.type)),
    makeText({ x: x + (width / 2), y: y + 11 }, content, bandLabelTextStyle),
  ];
}

// The line under the pointer, with the level of the whole curve at that frequency.
/**
 * @param {View} view
 * @param {Point} hover
 * @param {Band[]} curveBands
 * @returns {SVGElement[]}
 */
export function drawHover(view, hover, curveBands) {
  const { size } = view;
  const reading = readPoint(view, hover.x, hover.y);
  const [valueDb] = responseDb(curveBands, Float32Array.of(reading.frequencyHz));
  const [low, high] = findGainAxisEnds(view, reading.frequencyHz);
  const dot = placePoint(view, reading.frequencyHz, valueDb);
  const content = `${formatHz(reading.frequencyHz)} Hz  ${formatDb(valueDb)} dB`;
  const width = (content.length * charWidthPx) + 10;
  const x = size.left + size.plotWidth - width;
  const y = size.top + (view.isTall ? 2 : 16);

  return [
    makeLine(low, high, hoverLineStyle),
    makeCircle(dot, 3, hoverDotStyle),
    makeRect({ x, y, width, height: 15 }, hoverBoxStyle),
    makeText({ x: x + 5, y: y + 11 }, content, hoverTextStyle),
  ];
}

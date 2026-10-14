// The band points, the chosen band with its handles and label, and the reading under the pointer.
import { hasGain, responseDb } from "../shared/bands.js";
import { clamp, qToOctaves } from "../shared/math.js";
import { backgroundColor, layerColor, textColor, typeColor } from "./colors.js";
import { formatDb, formatHz } from "./format.js";
import { drawArea, makeLine } from "./svg.js";
import { drawnGainDb, findGainAxisEnds, placePoint, readPoint } from "./view.js";

/** @typedef {import("../shared/bands.js").Band} Band */

/** @typedef {import("./view.js").View} View */

/** @typedef {import("./view.js").Point} Point */

/** @typedef {import("./graph.js").BandEntry} BandEntry */

/** @typedef {{ index: number, x: number, y: number }} NodePoint */

// The width of one character of the 9.5 px label text, to size the box around a label.
const charWidthPx = 5.6;

// A chosen peak gets two square handles, half its width out on each side.
/**
 * @param {View} view
 * @param {Band} band
 * @param {Float32Array} frequencies
 * @returns {{ svg: string, handles: Point[] }}
 */
export function drawSelectedBand(view, band, frequencies) {
  const alone = [{ ...band, on: true }];
  const area = drawArea(view, frequencies, responseDb(alone, frequencies), `fill="${typeColor[band.type]}" fill-opacity="0.18"`);
  if (band.type !== "PK") return { svg: area, handles: [] };

  const halfOctaves = qToOctaves(band.q) / 2;
  const sidesHz = Float32Array.from([-1, 1], (side) => band.frequencyHz * (2 ** (side * halfOctaves)));
  const sidesDb = responseDb(alone, sidesHz);
  const parts = [area];
  const handles = [];
  sidesHz.forEach((frequencyHz, index) => {
    const [low, high] = findGainAxisEnds(view, frequencyHz);
    const handle = placePoint(view, frequencyHz, sidesDb[index]);
    parts.push(makeLine(low, high, `stroke="${typeColor.PK}" stroke-opacity="0.55" stroke-dasharray="3 3"`));
    parts.push(`<rect x="${handle.x - 5}" y="${handle.y - 5}" width="10" height="10" rx="2" fill="${backgroundColor}" stroke="${typeColor.PK}" stroke-width="2"/>`);
    handles.push(handle);
  });

  return { svg: parts.join(""), handles };
}

/**
 * @param {View} view
 * @param {BandEntry[]} entries
 * @param {number} selectedIndex
 * @returns {{ svg: string, nodes: NodePoint[] }}
 */
export function drawNodes(view, entries, selectedIndex) {
  const nodes = [];
  const svg = entries.map(({ role, band }, index) => {
    const point = placePoint(view, band.frequencyHz, drawnGainDb(band));
    nodes.push({ index, x: point.x, y: point.y });
    const fill = band.on ? typeColor[band.type] : backgroundColor;
    const ring = index === selectedIndex ? `<circle cx="${point.x}" cy="${point.y}" r="11" fill="none" stroke="#fff" stroke-opacity="0.7"/>` : "";
    const earRing = role === "ear" ? `<circle cx="${point.x}" cy="${point.y}" r="9.5" fill="none" stroke="${layerColor.ear}" stroke-width="1.5"/>` : "";
    return `${earRing}${ring}<circle cx="${point.x}" cy="${point.y}" r="7" fill="${fill}" stroke="${typeColor[band.type]}" stroke-width="1.5"/>`
      + `<text x="${point.x}" y="${point.y + 3}" text-anchor="middle" font-size="9" font-weight="700" fill="${backgroundColor}">${index + 1}</text>`;
  }).join("");

  return { svg, nodes };
}

// The label above the chosen point, with its frequency, gain and Q.
/**
 * @param {View} view
 * @param {Band} band
 * @returns {string}
 */
export function drawPill(view, band) {
  const { size } = view;
  const point = placePoint(view, band.frequencyHz, drawnGainDb(band));
  const gain = hasGain(band.type) ? `${formatDb(band.gainDb)} dB  ` : "";
  const content = `${formatHz(band.frequencyHz)} Hz  ${gain}Q ${band.q.toFixed(2)}`;
  const width = (content.length * charWidthPx) + 12;
  const x = clamp(point.x - (width / 2), 2, size.width - width - 2);
  const y = point.y > size.top + 30 ? point.y - 30 : point.y + 16;
  return `<rect x="${x}" y="${y}" width="${width}" height="16" rx="8" fill="${backgroundColor}" stroke="${typeColor[band.type]}"/>`
    + `<text x="${x + (width / 2)}" y="${y + 11}" text-anchor="middle" font-size="9.5" fill="${textColor}">${content}</text>`;
}

// The line under the pointer, with the level of the whole curve at that frequency.
/**
 * @param {View} view
 * @param {Point} hover
 * @param {Band[]} curveBands
 * @returns {string}
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
  return makeLine(low, high, `stroke="rgba(255,255,255,0.25)"`)
    + `<circle cx="${dot.x}" cy="${dot.y}" r="3" fill="#fff"/>`
    + `<rect x="${x}" y="${y}" width="${width}" height="15" rx="4" fill="rgba(14,16,19,0.9)"/>`
    + `<text x="${x + 5}" y="${y + 11}" font-size="9.5" fill="${textColor}">${content}</text>`;
}

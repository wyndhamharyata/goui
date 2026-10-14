import {
  clamp,
  frequencyRangeHz,
  hasGain,
  octavesToQ,
  qStepRatio,
  qToOctaves,
  responseDb,
  roundGainDb,
  setBandFrequency,
  setBandGain,
  setBandQ,
  sweepPointCount,
} from "./shared/bands.js";

/** @typedef {import("./shared/bands.js").Band} Band */

/** @typedef {import("./shared/config.js").LayerBands} LayerBands */

/** @typedef {{ role: import("./shared/config.js").LayerRole, band: Band }} BandEntry */

/** @typedef {{ x: number, y: number }} Point */

/** @typedef {{ width: number, height: number, left: number, top: number, plotWidth: number, plotHeight: number }} PlotSize */

/**
 * @typedef {object} GraphOptions
 * @property {number} height
 * @property {number} tallHeight
 * @property {boolean} interactive
 */

/**
 * @typedef {object} GraphHooks
 * @property {() => BandEntry[]} listBandEntries
 * @property {() => Band[]} listCurveBands
 * @property {() => LayerBands[]} listCurveLayers
 * @property {() => number[]} readSpectrumDb
 * @property {() => number} readSelectedIndex
 * @property {() => boolean} isEqOff
 * @property {(index: number) => void} selectBand
 * @property {() => void} commitBandEdit
 * @property {(frequencyHz: number, gainDb: number) => void} addBand
 */

/**
 * @typedef {object} Graph
 * @property {() => void} render
 * @property {() => void} renderSpectrum
 * @property {string} zoom
 * @property {boolean} isTall
 * @property {(zoom: string) => void} setZoom
 * @property {(isTall: boolean) => void} setTall
 */

// The graph shows ±15 dB. A band beyond that draws at the edge.
const maxShownGainDb = 15;
const ticksHz = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000];
const majorTicksHz = [100, 1000, 10_000];
const zooms = { all: frequencyRangeHz, lows: [20, 400], mids: [200, 5000], highs: [2000, 20_000] };
const backgroundColor = "#0e1013";
const textColor = "#e6e9ef";
const spectrumFill = `fill="rgba(150,165,200,0.13)"`;
// The spectrum fill starts at the floor and runs up. A floor 100 dB below full scale puts a normal
// song around the middle, with its peaks in the upper half.
const spectrumFloorDb = -100;
// The width of one character of the 9.5 px label text, to size the box around a label.
const charWidthPx = 5.6;

const regions = [
  { lowHz: 20, highHz: 60, name: "Sub" },
  { lowHz: 60, highHz: 250, name: "Bass" },
  { lowHz: 250, highHz: 500, name: "Low mids" },
  { lowHz: 500, highHz: 2000, name: "Mids" },
  { lowHz: 2000, highHz: 6000, name: "Presence" },
  { lowHz: 6000, highHz: 20_000, name: "Treble" },
];

const shelfColor = "#2ec4b6";
const passColor = "#ff9f43";
export const typeColor = {
  PK: "#b06bff",
  LSC: shelfColor,
  HSC: shelfColor,
  LSF: shelfColor,
  HSF: shelfColor,
  LP: passColor,
  HP: passColor,
  BP: passColor,
  NO: passColor,
  AP: passColor,
};

export const layerColor = { headphone: "#a9b8ff", ear: "#ffd166" };

/**
 * @param {number} frequencyHz
 * @returns {string}
 */
export function formatHz(frequencyHz) {
  if (frequencyHz >= 1000) return `${Math.round(frequencyHz / 100) / 10}k`;
  return `${Math.round(frequencyHz)}`;
}

/**
 * @param {number} gainDb
 * @returns {string}
 */
export function formatDb(gainDb) {
  return `${gainDb > 0 ? "+" : ""}${gainDb.toFixed(1)}`;
}

// The offscreen document sends its points on logSweepHz, so the point for a frequency is found the
// same way back.
/**
 * @param {number[]} spectrumDb
 * @param {number} frequencyHz
 * @returns {number}
 */
function readSpectrumAt(spectrumDb, frequencyHz) {
  const [lowHz, highHz] = frequencyRangeHz;
  const position = (Math.log(frequencyHz / lowHz) / Math.log(highHz / lowHz)) * (spectrumDb.length - 1);
  return spectrumDb[clamp(Math.round(position), 0, spectrumDb.length - 1)];
}

// A band with no gain draws its point on the 0 dB line.
/**
 * @param {Band} band
 * @returns {number}
 */
function drawnGainDb(band) {
  return hasGain(band.type) ? band.gainDb : 0;
}

// The drawing below is plain functions of a view: the zoom, the tall or wide turn, and the size of
// the plot. Only makeGraph holds state.
/** @typedef {{ zoom: string, isTall: boolean, size: PlotSize }} View */

/** @typedef {{ index: number, x: number, y: number }} NodePoint */

// A press on a point moves the band. A press on a side handle sets its Q.
/**
 * @typedef {object} Drag
 * @property {"move" | "q"} kind
 * @property {number} index
 * @property {number} startX
 * @property {number} startY
 * @property {number} startHz
 * @property {number} startDb
 * @property {boolean} [isMoving]
 * @property {boolean} [isFine]
 */

/**
 * @param {View} view
 * @param {number} frequencyHz
 * @returns {number}
 */
function frequencyToRatio(view, frequencyHz) {
  const [lowHz, highHz] = zooms[view.zoom];
  return Math.log(frequencyHz / lowHz) / Math.log(highHz / lowHz);
}

/**
 * @param {View} view
 * @param {number} ratio
 * @returns {number}
 */
function ratioToFrequency(view, ratio) {
  const [lowHz, highHz] = zooms[view.zoom];
  return clamp(lowHz * ((highHz / lowHz) ** ratio), ...frequencyRangeHz);
}

// The frequency runs along the plot and the gain across it. A wide graph has frequency on x. A tall
// one has it on y.
/**
 * @param {View} view
 * @param {number} frequencyHz
 * @param {number} gainDb
 * @returns {Point}
 */
function placePoint(view, frequencyHz, gainDb) {
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
function readPoint(view, x, y) {
  const { size } = view;
  const along = view.isTall ? (y - size.top) / size.plotHeight : (x - size.left) / size.plotWidth;
  const across = view.isTall ? (x - size.left) / size.plotWidth : 1 - ((y - size.top) / size.plotHeight);
  const gainDb = clamp((across * 2 * maxShownGainDb) - maxShownGainDb, -maxShownGainDb, maxShownGainDb);
  return { frequencyHz: ratioToFrequency(view, along), gainDb };
}

/**
 * @param {Point} from
 * @param {Point} to
 * @param {string} style
 * @returns {string}
 */
function makeLine(from, to, style) {
  return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" ${style}/>`;
}

/**
 * @param {Point} point
 * @param {string} content
 * @param {string} style
 * @returns {string}
 */
function makeText(point, content, style) {
  return `<text x="${point.x}" y="${point.y}" fill="rgba(255,255,255,0.45)" font-size="9" ${style}>${content}</text>`;
}

/**
 * @param {View} view
 * @param {number} frequencyHz
 * @returns {Point[]}
 */
function findGainAxisEnds(view, frequencyHz) {
  return [placePoint(view, frequencyHz, -maxShownGainDb), placePoint(view, frequencyHz, maxShownGainDb)];
}

/**
 * @param {View} view
 * @returns {Float32Array}
 */
function sweepFrequencies(view) {
  return Float32Array.from({ length: sweepPointCount }, (_, index) => ratioToFrequency(view, index / (sweepPointCount - 1)));
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
function drawArea(view, frequencies, valuesDb, fill) {
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
function drawCurve(view, frequencies, valuesDb, stroke) {
  return `<polyline points="${tracePoints(view, frequencies, valuesDb).join(" ")}" fill="none" ${stroke}/>`;
}

/**
 * @param {View} view
 * @returns {string}
 */
function drawRegions(view) {
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
function drawFrequencyGrid(view) {
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
function drawGainGrid(view) {
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

/**
 * @param {View} view
 * @param {Float32Array} frequencies
 * @param {number[]} spectrumDb
 * @returns {string}
 */
function drawSpectrum(view, frequencies, spectrumDb) {
  if (spectrumDb.length === 0) return "";
  if (view.isTall) return drawMirroredSpectrum(view, frequencies, spectrumDb);

  const { size } = view;
  // Array.from, not map. A Float32Array.map would turn each point string into a number.
  const points = Array.from(frequencies, (frequencyHz) => {
    const level = clamp((readSpectrumAt(spectrumDb, frequencyHz) - spectrumFloorDb) / (0 - spectrumFloorDb), 0, 1);
    return `${placePoint(view, frequencyHz, 0).x},${size.top + (size.plotHeight * (1 - level))}`;
  });
  const floor = [`${size.left + size.plotWidth},${size.top + size.plotHeight}`, `${size.left},${size.top + size.plotHeight}`];
  return `<polygon points="${[...points, ...floor].join(" ")}" ${spectrumFill}/>`;
}

// The tall view stays even on both sides of the center line, with the 3 dB per octave slope that
// stands the spectrum upright. That slope lifts the treble, so the span is 90 dB, not 100, and each
// side takes up to 45% of the width.
/**
 * @param {View} view
 * @param {Float32Array} frequencies
 * @param {number[]} spectrumDb
 * @returns {string}
 */
function drawMirroredSpectrum(view, frequencies, spectrumDb) {
  const spanDb = 90;
  const rise = view.size.plotWidth * 0.45;
  const right = [];
  const left = [];
  for (const frequencyHz of frequencies) {
    const levelDb = readSpectrumAt(spectrumDb, frequencyHz) + (3 * Math.log2(frequencyHz / 1000));
    const halfWidth = clamp((levelDb - spectrumFloorDb) / spanDb, 0, 1) * rise;
    const center = placePoint(view, frequencyHz, 0);
    right.push(`${center.x + halfWidth},${center.y}`);
    left.unshift(`${center.x - halfWidth},${center.y}`);
  }
  return `<polygon points="${[...right, ...left].join(" ")}" ${spectrumFill}/>`;
}

// Boosts fill red and cuts fill blue.
/**
 * @param {View} view
 * @param {Float32Array} frequencies
 * @param {Float32Array} curveDb
 * @returns {string}
 */
function drawLoudness(view, frequencies, curveDb) {
  const boostDb = curveDb.map((valueDb) => Math.max(valueDb, 0));
  const cutDb = curveDb.map((valueDb) => Math.min(valueDb, 0));
  return drawArea(view, frequencies, boostDb, `fill="rgba(255,122,144,0.24)"`) + drawArea(view, frequencies, cutDb, `fill="rgba(79,163,255,0.24)"`);
}

// A chosen peak gets two square handles, half its width out on each side.
/**
 * @param {View} view
 * @param {Band} band
 * @param {Float32Array} frequencies
 * @returns {{ svg: string, handles: Point[] }}
 */
function drawSelectedBand(view, band, frequencies) {
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
function drawNodes(view, entries, selectedIndex) {
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
function drawPill(view, band) {
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
function drawHover(view, hover, curveBands) {
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

// Each layer's own curve, dashed, under the solid total.
/**
 * @param {View} view
 * @param {Float32Array} frequencies
 * @param {LayerBands[]} layers
 * @returns {string}
 */
function drawLayerCurves(view, frequencies, layers) {
  return layers.map((layer) => {
    const stroke = `stroke="${layerColor[layer.role]}" stroke-width="1.5" stroke-dasharray="4 3"`;
    return drawCurve(view, frequencies, responseDb(layer.bands, frequencies), stroke);
  }).join("");
}

// A point moves from where it was grabbed, so it never jumps under the pointer. Shift moves it a
// quarter as far, for fine steps on a narrow panel.
/**
 * @param {View} view
 * @param {Band} band
 * @param {Drag} drag
 * @param {Point} pointer
 */
function moveBand(view, band, drag, pointer) {
  const scale = drag.isFine ? 0.25 : 1;
  const start = placePoint(view, drag.startHz, drag.startDb);
  const target = readPoint(view, start.x + ((pointer.x - drag.startX) * scale), start.y + ((pointer.y - drag.startY) * scale));
  setBandFrequency(band, target.frequencyHz);
  setBandGain(band, target.gainDb);
}

// The handle is half the band's width out, so the width is twice the distance in octaves.
/**
 * @param {View} view
 * @param {Band} band
 * @param {Point} pointer
 */
function setQFromPointer(view, band, pointer) {
  const octaves = 2 * Math.abs(Math.log2(readPoint(view, pointer.x, pointer.y).frequencyHz / band.frequencyHz));
  const narrowestOctaves = 0.05;
  setBandQ(band, octavesToQ(Math.max(octaves, narrowestOctaves)));
}

// A graph that is not interactive draws no points and takes no input.
/**
 * @param {HTMLElement} host
 * @param {GraphOptions} options
 * @param {GraphHooks} hooks
 * @returns {Graph}
 */
export function makeGraph(host, options, hooks) {
  let zoom = "all";
  let isTall = false;
  /** @type {Point | null} */
  let hover = null;
  /** @type {Drag | null} */
  let drag = null;
  // Where the last render put the points and the handles, so a press can find them.
  /** @type {{ nodes: NodePoint[], handles: Point[] }} */
  let hitPoints = { nodes: [], handles: [] };
  const clipId = `clip-${host.id}`;

  /** @returns {View} */
  function measureView() {
    const height = isTall ? options.tallHeight : options.height;
    const top = isTall ? 16 : 8;
    const bottom = isTall ? 6 : 16;
    const size = { width: host.clientWidth, height, left: 30, top, plotWidth: host.clientWidth - 38, plotHeight: height - top - bottom };
    return { zoom, isTall, size };
  }

  /**
   * @param {number} index
   * @returns {Band | undefined}
   */
  function bandAt(index) {
    const entry = hooks.listBandEntries()[index];
    return entry && entry.band;
  }

  /**
   * @param {View} view
   * @returns {string}
   */
  function drawHoverNow(view) {
    if (!hover || drag) return "";
    return drawHover(view, hover, hooks.listCurveBands());
  }

  // A spectrum frame or a hover move redraws its own group alone. Replacing the whole SVG would
  // remove the element under the pointer, and the browser then reads a press as cancelled and sends
  // no click.
  /**
   * @param {string} name
   * @param {(view: View) => string} draw
   */
  function renderGroup(name, draw) {
    const group = host.querySelector(`[data-${name}]`);
    if (group) group.innerHTML = draw(measureView());
    else render();
  }

  function renderSpectrum() {
    renderGroup("spectrum", (view) => drawSpectrum(view, sweepFrequencies(view), hooks.readSpectrumDb()));
  }

  function renderHover() {
    renderGroup("hover", drawHoverNow);
  }

  function render() {
    const view = measureView();
    const { size } = view;
    if (size.width === 0) return;
    const frequencies = sweepFrequencies(view);
    const curveDb = responseDb(hooks.listCurveBands(), frequencies);
    const selectedIndex = hooks.readSelectedIndex();
    const band = bandAt(selectedIndex);
    const showsPoints = options.interactive;

    const selected = showsPoints && band ? drawSelectedBand(view, band, frequencies) : { svg: "", handles: [] };
    const nodes = showsPoints ? drawNodes(view, hooks.listBandEntries(), selectedIndex) : { svg: "", nodes: [] };
    hitPoints = { nodes: nodes.nodes, handles: selected.handles };
    const curveColor = hooks.isEqOff() ? "rgba(255,255,255,0.35)" : "#5b8cff";
    const curve = drawCurve(view, frequencies, curveDb, `stroke="${curveColor}" stroke-width="2"`);
    const pill = showsPoints && band ? drawPill(view, band) : "";
    const spectrum = drawSpectrum(view, frequencies, hooks.readSpectrumDb());
    const layerCurves = drawLayerCurves(view, frequencies, hooks.listCurveLayers());
    host.innerHTML = `<svg viewBox="0 0 ${size.width} ${size.height}" height="${size.height}">
      <defs><clipPath id="${clipId}"><rect x="${size.left}" y="${size.top}" width="${size.plotWidth}" height="${size.plotHeight}"/></clipPath></defs>
      ${drawRegions(view)}${drawFrequencyGrid(view)}${drawGainGrid(view)}
      <g clip-path="url(#${clipId})"><g data-spectrum>${spectrum}</g>${drawLoudness(view, frequencies, curveDb)}${selected.svg}${layerCurves}${curve}</g>
      ${nodes.svg}${pill}<g data-hover>${drawHoverNow(view)}</g>
    </svg>`;
  }

  /**
   * @param {MouseEvent} event
   * @returns {Point}
   */
  function readPointer(event) {
    const bounds = host.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  /**
   * @param {Point} pointer
   * @returns {{ kind: "q" | "move", index: number } | null}
   */
  function findTarget(pointer) {
    /**
     * @param {Point} item
     * @param {number} radiusPx
     * @returns {boolean}
     */
    const isNear = (item, radiusPx) => Math.hypot(item.x - pointer.x, item.y - pointer.y) < radiusPx;
    const handleRadiusPx = 12;
    const pointRadiusPx = 14;
    if (hitPoints.handles.some((handle) => isNear(handle, handleRadiusPx))) return { kind: "q", index: hooks.readSelectedIndex() };
    // The last point drawn is on top, so it wins a press on two points.
    const node = [...hitPoints.nodes].reverse().find((item) => isNear(item, pointRadiusPx));
    return node ? { kind: "move", index: node.index } : null;
  }

  /** @param {PointerEvent} event */
  function startDrag(event) {
    const pointer = readPointer(event);
    const target = findTarget(pointer);
    if (!target) return;
    const band = bandAt(target.index);
    drag = { ...target, startX: pointer.x, startY: pointer.y, startHz: band.frequencyHz, startDb: drawnGainDb(band) };
    host.setPointerCapture(event.pointerId);
    hooks.selectBand(target.index);
  }

  /** @param {PointerEvent} event */
  function followPointer(event) {
    const pointer = readPointer(event);
    hover = pointer;
    if (!drag) {
      renderHover();
      return;
    }
    // A press only selects. The point moves once the pointer has gone 5 px, counted from there.
    if (!drag.isMoving) {
      const deadZonePx = 5;
      if (Math.hypot(pointer.x - drag.startX, pointer.y - drag.startY) < deadZonePx) return;
      drag.isMoving = true;
      drag.startX = pointer.x;
      drag.startY = pointer.y;
    }
    const band = bandAt(drag.index);
    drag.isFine = event.shiftKey;
    if (drag.kind === "move") moveBand(measureView(), band, drag, pointer);
    else setQFromPointer(measureView(), band, pointer);
    hooks.commitBandEdit();
  }

  function endDrag() {
    const wasDragging = Boolean(drag);
    drag = null;
    // A full redraw here would remove the point the press started on, and the browser would then
    // send no click. Only the hover reading changes when a drag ends.
    if (wasDragging) renderHover();
  }

  /** @param {MouseEvent} event */
  function addBandAtPointer(event) {
    const pointer = readPointer(event);
    if (findTarget(pointer)) return;
    const reading = readPoint(measureView(), pointer.x, pointer.y);
    hooks.addBand(Math.round(reading.frequencyHz), roundGainDb(reading.gainDb));
  }

  /** @param {WheelEvent} event */
  function stepQWithWheel(event) {
    const target = findTarget(readPointer(event));
    if (!target) return;
    event.preventDefault();
    const band = bandAt(target.index);
    setBandQ(band, band.q * (qStepRatio ** (event.deltaY < 0 ? 1 : -1)));
    hooks.selectBand(target.index);
    hooks.commitBandEdit();
  }

  if (options.interactive) {
    host.addEventListener("pointerdown", startDrag);
    host.addEventListener("pointermove", followPointer);
    host.addEventListener("pointerup", endDrag);
    host.addEventListener("pointerleave", () => {
      hover = null;
      if (!drag) renderHover();
    });
    host.addEventListener("dblclick", addBandAtPointer);
    host.addEventListener("wheel", stepQWithWheel, { passive: false });
  }

  new ResizeObserver(render).observe(host);

  return {
    render,
    renderSpectrum,
    get zoom() {
      return zoom;
    },
    get isTall() {
      return isTall;
    },
    setZoom(nextZoom) {
      zoom = nextZoom;
      render();
    },
    setTall(nextIsTall) {
      isTall = nextIsTall;
      render();
    },
  };
}

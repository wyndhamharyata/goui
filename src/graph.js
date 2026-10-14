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

/** @typedef {{ x: number, y: number, size: PlotSize }} PointerPoint */

/**
 * @typedef {object} GraphOptions
 * @property {number} height
 * @property {number} tallHeight
 * @property {boolean} interactive
 * @property {boolean} [regions]
 * @property {boolean} [layerCurves]
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
 * @property {() => void} renderHover
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

// A graph that is not interactive draws no points and takes no input.
/**
 * @param {HTMLElement} host
 * @param {GraphOptions} options
 * @param {GraphHooks} hooks
 * @returns {Graph}
 */
export function makeGraph(host, options, hooks) {
  const graph = { zoom: "all", isTall: false, hover: null, drag: null, nodes: [], handles: [] };
  const clipId = `clip-${host.id}`;

  /**
   * @param {number} index
   * @returns {Band | undefined}
   */
  function bandAt(index) {
    const entry = hooks.listBandEntries()[index];
    return entry && entry.band;
  }

  /** @returns {PlotSize} */
  function measurePlot() {
    const height = graph.isTall ? options.tallHeight : options.height;
    const top = graph.isTall ? 16 : 8;
    const bottom = graph.isTall ? 6 : 16;
    return { width: host.clientWidth, height, left: 30, top, plotWidth: host.clientWidth - 38, plotHeight: height - top - bottom };
  }

  /**
   * @param {number} frequencyHz
   * @returns {number}
   */
  function frequencyToRatio(frequencyHz) {
    const [lowHz, highHz] = zooms[graph.zoom];
    return Math.log(frequencyHz / lowHz) / Math.log(highHz / lowHz);
  }

  /**
   * @param {number} ratio
   * @returns {number}
   */
  function ratioToFrequency(ratio) {
    const [lowHz, highHz] = zooms[graph.zoom];
    return clamp(lowHz * (highHz / lowHz) ** ratio, ...frequencyRangeHz);
  }

  /**
   * @param {number} frequencyHz
   * @param {number} gainDb
   * @param {PlotSize} size
   * @returns {Point}
   */
  function placePoint(frequencyHz, gainDb, size) {
    const along = frequencyToRatio(frequencyHz);
    const across = (clamp(gainDb, -maxShownGainDb, maxShownGainDb) + maxShownGainDb) / (2 * maxShownGainDb);
    if (graph.isTall) return { x: size.left + (across * size.plotWidth), y: size.top + (along * size.plotHeight) };
    return { x: size.left + (along * size.plotWidth), y: size.top + ((1 - across) * size.plotHeight) };
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {PlotSize} size
   * @returns {{ frequencyHz: number, gainDb: number }}
   */
  function readPoint(x, y, size) {
    const along = graph.isTall ? (y - size.top) / size.plotHeight : (x - size.left) / size.plotWidth;
    const across = graph.isTall ? (x - size.left) / size.plotWidth : 1 - ((y - size.top) / size.plotHeight);
    return { frequencyHz: ratioToFrequency(along), gainDb: clamp((across * 2 * maxShownGainDb) - maxShownGainDb, -maxShownGainDb, maxShownGainDb) };
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
   * @param {number} frequencyHz
   * @param {PlotSize} size
   * @returns {Point[]}
   */
  function findGainAxisEnds(frequencyHz, size) {
    return [placePoint(frequencyHz, -maxShownGainDb, size), placePoint(frequencyHz, maxShownGainDb, size)];
  }

  /** @returns {Float32Array} */
  function sweepFrequencies() {
    return Float32Array.from({ length: sweepPointCount }, (_, index) => ratioToFrequency(index / (sweepPointCount - 1)));
  }

  /**
   * @param {Float32Array} frequencies
   * @param {ArrayLike<number>} valuesDb
   * @param {PlotSize} size
   * @returns {string[]}
   */
  function tracePoints(frequencies, valuesDb, size) {
    return Array.from(frequencies, (frequencyHz, index) => {
      const point = placePoint(frequencyHz, valuesDb[index], size);
      return `${point.x},${point.y}`;
    });
  }

  // The area between the 0 dB line and a curve.
  /**
   * @param {PlotSize} size
   * @param {Float32Array} frequencies
   * @param {ArrayLike<number>} valuesDb
   * @param {string} fill
   * @returns {string}
   */
  function drawArea(size, frequencies, valuesDb, fill) {
    const start = placePoint(frequencies[0], 0, size);
    const end = placePoint(frequencies.at(-1), 0, size);
    const edge = tracePoints(frequencies, valuesDb, size);
    return `<polygon points="${start.x},${start.y} ${edge.join(" ")} ${end.x},${end.y}" ${fill}/>`;
  }

  /**
   * @param {PlotSize} size
   * @param {Float32Array} frequencies
   * @param {ArrayLike<number>} valuesDb
   * @param {string} stroke
   * @returns {string}
   */
  function drawCurve(size, frequencies, valuesDb, stroke) {
    return `<polyline points="${tracePoints(frequencies, valuesDb, size).join(" ")}" fill="none" ${stroke}/>`;
  }

  function drawRegions(size) {
    return regions.map((region, index) => {
      const start = placePoint(Math.max(region.lowHz, zooms[graph.zoom][0]), maxShownGainDb, size);
      const end = placePoint(Math.min(region.highHz, zooms[graph.zoom][1]), -maxShownGainDb, size);
      const length = graph.isTall ? end.y - start.y : end.x - start.x;
      if (length <= 0) return "";
      const fill = index % 2 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0)";
      const rect = graph.isTall
        ? `<rect x="${size.left}" y="${start.y}" width="${size.plotWidth}" height="${length}" fill="${fill}"/>`
        : `<rect x="${start.x}" y="${size.top}" width="${length}" height="${size.plotHeight}" fill="${fill}"/>`;
      if (length < 40) return rect;
      const tallSpot = { x: size.left + size.plotWidth - 4, y: start.y + (length / 2) + 3 };
      const wideSpot = { x: start.x + (length / 2), y: size.top + 10 };
      const anchor = graph.isTall ? "end" : "middle";
      return rect + makeText(graph.isTall ? tallSpot : wideSpot, region.name, `text-anchor="${anchor}" fill-opacity="0.8"`);
    }).join("");
  }

  function drawFrequencyGrid(size) {
    const parts = [];
    let lastLabelAt = -Infinity;
    for (const frequencyHz of ticksHz) {
      const ratio = frequencyToRatio(frequencyHz);
      const isInView = ratio > -0.001 && ratio < 1.001;
      if (!isInView) continue;
      const [low, high] = findGainAxisEnds(frequencyHz, size);
      const opacity = majorTicksHz.includes(frequencyHz) ? 0.13 : 0.05;
      parts.push(makeLine(low, high, `stroke="rgba(255,255,255,${opacity})"`));
      const labelAt = graph.isTall ? low.y : low.x;
      const minLabelSpacingPx = 26;
      if (labelAt - lastLabelAt < minLabelSpacingPx) continue;
      lastLabelAt = labelAt;
      const spot = graph.isTall ? { x: 4, y: low.y + 3 } : { x: low.x, y: size.height - 4 };
      parts.push(makeText(spot, formatHz(frequencyHz), `text-anchor="${graph.isTall ? "start" : "middle"}"`));
    }
    return parts.join("");
  }

  function drawGainGrid(size) {
    const parts = [];
    for (const gainDb of [-12, -6, 0, 6, 12]) {
      const from = placePoint(zooms[graph.zoom][0], gainDb, size);
      const to = placePoint(zooms[graph.zoom][1], gainDb, size);
      parts.push(makeLine(from, to, `stroke="rgba(255,255,255,${gainDb === 0 ? 0.22 : 0.05})"`));
      const spot = graph.isTall ? { x: from.x, y: 11 } : { x: 4, y: from.y + 3 };
      parts.push(makeText(spot, gainDb > 0 ? `+${gainDb}` : `${gainDb}`, `text-anchor="${graph.isTall ? "middle" : "start"}"`));
    }
    return parts.join("");
  }

  /**
   * @param {PlotSize} size
   * @param {Float32Array} frequencies
   * @returns {string}
   */
  function drawSpectrum(size, frequencies) {
    const spectrumDb = hooks.readSpectrumDb();
    if (spectrumDb.length === 0) return "";
    if (graph.isTall) return drawMirroredSpectrum(size, frequencies, spectrumDb);

    // Array.from, not map. A Float32Array.map would turn each point string into a number.
    const points = Array.from(frequencies, (frequencyHz) => {
      const level = clamp((readSpectrumAt(spectrumDb, frequencyHz) - spectrumFloorDb) / (0 - spectrumFloorDb), 0, 1);
      return `${placePoint(frequencyHz, 0, size).x},${size.top + (size.plotHeight * (1 - level))}`;
    });
    const floor = [`${size.left + size.plotWidth},${size.top + size.plotHeight}`, `${size.left},${size.top + size.plotHeight}`];
    return `<polygon points="${[...points, ...floor].join(" ")}" ${spectrumFill}/>`;
  }

  // The tall view stays even on both sides of the center line, with the 3 dB per octave slope that
  // stands the spectrum upright. That slope lifts the treble, so the span is 90 dB, not 100, and each
  // side takes up to 45% of the width.
  function drawMirroredSpectrum(size, frequencies, spectrumDb) {
    const spanDb = 90;
    const rise = size.plotWidth * 0.45;
    const right = [];
    const left = [];
    for (const frequencyHz of frequencies) {
      const levelDb = readSpectrumAt(spectrumDb, frequencyHz) + (3 * Math.log2(frequencyHz / 1000));
      const halfWidth = clamp((levelDb - spectrumFloorDb) / spanDb, 0, 1) * rise;
      const center = placePoint(frequencyHz, 0, size);
      right.push(`${center.x + halfWidth},${center.y}`);
      left.unshift(`${center.x - halfWidth},${center.y}`);
    }
    return `<polygon points="${[...right, ...left].join(" ")}" ${spectrumFill}/>`;
  }

  function drawLoudness(size, frequencies, curveDb) {
    const boostDb = curveDb.map((valueDb) => Math.max(valueDb, 0));
    const cutDb = curveDb.map((valueDb) => Math.min(valueDb, 0));
    return drawArea(size, frequencies, boostDb, `fill="rgba(255,122,144,0.24)"`) + drawArea(size, frequencies, cutDb, `fill="rgba(79,163,255,0.24)"`);
  }

  function drawSelectedBand(size, band, frequencies) {
    const alone = [{ ...band, on: true }];
    const area = drawArea(size, frequencies, responseDb(alone, frequencies), `fill="${typeColor[band.type]}" fill-opacity="0.18"`);
    if (band.type !== "PK") return area;

    const halfOctaves = qToOctaves(band.q) / 2;
    const sidesHz = Float32Array.from([-1, 1], (side) => band.frequencyHz * (2 ** (side * halfOctaves)));
    const sidesDb = responseDb(alone, sidesHz);
    const parts = [area];
    sidesHz.forEach((frequencyHz, index) => {
      const [low, high] = findGainAxisEnds(frequencyHz, size);
      const handle = placePoint(frequencyHz, sidesDb[index], size);
      parts.push(makeLine(low, high, `stroke="${typeColor.PK}" stroke-opacity="0.55" stroke-dasharray="3 3"`));
      parts.push(`<rect x="${handle.x - 5}" y="${handle.y - 5}" width="10" height="10" rx="2" fill="${backgroundColor}" stroke="${typeColor.PK}" stroke-width="2"/>`);
      graph.handles.push(handle);
    });
    return parts.join("");
  }

  function drawNodes(size) {
    return hooks.listBandEntries().map((entry, index) => {
      const band = entry.band;
      const point = placePoint(band.frequencyHz, drawnGainDb(band), size);
      graph.nodes.push({ index, x: point.x, y: point.y });
      const fill = band.on ? typeColor[band.type] : backgroundColor;
      const ring = index === hooks.readSelectedIndex() ? `<circle cx="${point.x}" cy="${point.y}" r="11" fill="none" stroke="#fff" stroke-opacity="0.7"/>` : "";
      const earRing = entry.role === "ear" ? `<circle cx="${point.x}" cy="${point.y}" r="9.5" fill="none" stroke="${layerColor.ear}" stroke-width="1.5"/>` : "";
      return `${earRing}${ring}<circle cx="${point.x}" cy="${point.y}" r="7" fill="${fill}" stroke="${typeColor[band.type]}" stroke-width="1.5"/>`
        + `<text x="${point.x}" y="${point.y + 3}" text-anchor="middle" font-size="9" font-weight="700" fill="${backgroundColor}">${index + 1}</text>`;
    }).join("");
  }

  function drawPill(size, band) {
    const point = placePoint(band.frequencyHz, drawnGainDb(band), size);
    const gain = hasGain(band.type) ? `${formatDb(band.gainDb)} dB  ` : "";
    const content = `${formatHz(band.frequencyHz)} Hz  ${gain}Q ${band.q.toFixed(2)}`;
    const width = (content.length * charWidthPx) + 12;
    const x = clamp(point.x - (width / 2), 2, size.width - width - 2);
    const y = point.y > size.top + 30 ? point.y - 30 : point.y + 16;
    return `<rect x="${x}" y="${y}" width="${width}" height="16" rx="8" fill="${backgroundColor}" stroke="${typeColor[band.type]}"/>`
      + `<text x="${x + (width / 2)}" y="${y + 11}" text-anchor="middle" font-size="9.5" fill="${textColor}">${content}</text>`;
  }

  /**
   * @param {PlotSize} size
   * @returns {string}
   */
  function drawHover(size) {
    if (!graph.hover || graph.drag) return "";
    const reading = readPoint(graph.hover.x, graph.hover.y, size);
    const [valueDb] = responseDb(hooks.listCurveBands(), Float32Array.of(reading.frequencyHz));
    const [low, high] = findGainAxisEnds(reading.frequencyHz, size);
    const dot = placePoint(reading.frequencyHz, valueDb, size);
    const content = `${formatHz(reading.frequencyHz)} Hz  ${formatDb(valueDb)} dB`;
    const width = (content.length * charWidthPx) + 10;
    const x = size.left + size.plotWidth - width;
    const y = size.top + (graph.isTall ? 2 : 16);
    return makeLine(low, high, `stroke="rgba(255,255,255,0.25)"`)
      + `<circle cx="${dot.x}" cy="${dot.y}" r="3" fill="#fff"/>`
      + `<rect x="${x}" y="${y}" width="${width}" height="15" rx="4" fill="rgba(14,16,19,0.9)"/>`
      + `<text x="${x + 5}" y="${y + 11}" font-size="9.5" fill="${textColor}">${content}</text>`;
  }

  // Each layer's own curve, dashed, under the solid total.
  function drawLayerCurves(size, frequencies) {
    if (!options.layerCurves || !hooks.listCurveLayers) return "";
    return hooks.listCurveLayers().map((layer) => {
      const stroke = `stroke="${layerColor[layer.role]}" stroke-width="1.5" stroke-dasharray="4 3"`;
      return drawCurve(size, frequencies, responseDb(layer.bands, frequencies), stroke);
    }).join("");
  }

  // A spectrum frame or a hover move redraws its own group alone. Replacing the whole SVG would
  // remove the element under the pointer, and the browser then reads a press as cancelled and sends
  // no click.
  /**
   * @param {string} name
   * @param {(size: PlotSize) => string} draw
   */
  function renderGroup(name, draw) {
    const group = host.querySelector(`[data-${name}]`);
    if (group) group.innerHTML = draw(measurePlot());
    else render();
  }

  function renderSpectrum() {
    renderGroup("spectrum", (size) => drawSpectrum(size, sweepFrequencies()));
  }

  function renderHover() {
    renderGroup("hover", drawHover);
  }

  function render() {
    const size = measurePlot();
    if (size.width === 0) return;
    const frequencies = sweepFrequencies();
    const curveDb = responseDb(hooks.listCurveBands(), frequencies);
    const band = bandAt(hooks.readSelectedIndex());
    const showsPoints = options.interactive;
    graph.handles = [];
    graph.nodes = [];

    const selectedArea = showsPoints && band ? drawSelectedBand(size, band, frequencies) : "";
    const curveColor = hooks.isEqOff() ? "rgba(255,255,255,0.35)" : "#5b8cff";
    const curve = drawCurve(size, frequencies, curveDb, `stroke="${curveColor}" stroke-width="2"`);
    const nodes = showsPoints ? drawNodes(size) : "";
    const pill = showsPoints && band ? drawPill(size, band) : "";
    host.innerHTML = `<svg viewBox="0 0 ${size.width} ${size.height}" height="${size.height}">
      <defs><clipPath id="${clipId}"><rect x="${size.left}" y="${size.top}" width="${size.plotWidth}" height="${size.plotHeight}"/></clipPath></defs>
      ${options.regions === false ? "" : drawRegions(size)}${drawFrequencyGrid(size)}${drawGainGrid(size)}
      <g clip-path="url(#${clipId})"><g data-spectrum>${drawSpectrum(size, frequencies)}</g>${drawLoudness(size, frequencies, curveDb)}${selectedArea}${drawLayerCurves(size, frequencies)}${curve}</g>
      ${nodes}${pill}<g data-hover>${drawHover(size)}</g>
    </svg>`;
  }

  /**
   * @param {MouseEvent} event
   * @returns {PointerPoint}
   */
  function readPointer(event) {
    const bounds = host.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top, size: measurePlot() };
  }

  /**
   * @param {PointerPoint} point
   * @returns {{ kind: "q" | "move", index: number } | null}
   */
  function findTarget(point) {
    /**
     * @param {Point} item
     * @param {number} radiusPx
     * @returns {boolean}
     */
    const isNear = (item, radiusPx) => Math.hypot(item.x - point.x, item.y - point.y) < radiusPx;
    const handleRadiusPx = 12;
    const pointRadiusPx = 14;
    if (graph.handles.some((handle) => isNear(handle, handleRadiusPx))) return { kind: "q", index: hooks.readSelectedIndex() };
    const node = [...graph.nodes].reverse().find((item) => isNear(item, pointRadiusPx));
    return node ? { kind: "move", index: node.index } : null;
  }

  // A point moves from where it was grabbed, so it never jumps under the pointer. Shift moves it a
  // quarter as far, for fine steps on a narrow panel.
  function moveBand(band, point, isFine) {
    const scale = isFine ? 0.25 : 1;
    const start = placePoint(graph.drag.startHz, graph.drag.startDb, point.size);
    const target = readPoint(start.x + ((point.x - graph.drag.startX) * scale), start.y + ((point.y - graph.drag.startY) * scale), point.size);
    setBandFrequency(band, target.frequencyHz);
    setBandGain(band, target.gainDb);
  }

  function setQFromPointer(band, point) {
    const octaves = 2 * Math.abs(Math.log2(readPoint(point.x, point.y, point.size).frequencyHz / band.frequencyHz));
    const narrowestOctaves = 0.05;
    setBandQ(band, octavesToQ(Math.max(octaves, narrowestOctaves)));
  }

  if (options.interactive) {
    host.addEventListener("pointerdown", (event) => {
      const point = readPointer(event);
      const target = findTarget(point);
      if (!target) return;
      const band = bandAt(target.index);
      graph.drag = { ...target, startX: point.x, startY: point.y, startHz: band.frequencyHz, startDb: drawnGainDb(band) };
      host.setPointerCapture(event.pointerId);
      hooks.selectBand(target.index);
    });

    host.addEventListener("pointermove", (event) => {
      const point = readPointer(event);
      graph.hover = point;
      if (!graph.drag) {
        renderHover();
        return;
      }
      const band = bandAt(graph.drag.index);
      // A press only selects. The point moves once the pointer has gone 5 px, counted from there.
      if (!graph.drag.isMoving) {
        const deadZonePx = 5;
        if (Math.hypot(point.x - graph.drag.startX, point.y - graph.drag.startY) < deadZonePx) return;
        graph.drag.isMoving = true;
        graph.drag.startX = point.x;
        graph.drag.startY = point.y;
      }
      if (graph.drag.kind === "move") moveBand(band, point, event.shiftKey);
      else setQFromPointer(band, point);
      hooks.commitBandEdit();
    });

    host.addEventListener("pointerup", () => {
      const wasDragging = Boolean(graph.drag);
      graph.drag = null;
      // A full redraw here would remove the point the press started on, and the browser would then
      // send no click. Only the hover reading changes when a drag ends.
      if (wasDragging) renderHover();
    });

    host.addEventListener("pointerleave", () => {
      graph.hover = null;
      if (!graph.drag) renderHover();
    });

    host.addEventListener("dblclick", (event) => {
      const point = readPointer(event);
      if (findTarget(point)) return;
      const reading = readPoint(point.x, point.y, point.size);
      hooks.addBand(Math.round(reading.frequencyHz), roundGainDb(reading.gainDb));
    });

    host.addEventListener("wheel", (event) => {
      const target = findTarget(readPointer(event));
      if (!target) return;
      event.preventDefault();
      const band = bandAt(target.index);
      setBandQ(band, band.q * (qStepRatio ** (event.deltaY < 0 ? 1 : -1)));
      hooks.selectBand(target.index);
      hooks.commitBandEdit();
    }, { passive: false });
  }

  new ResizeObserver(render).observe(host);

  return {
    render,
    renderSpectrum,
    renderHover,
    get zoom() {
      return graph.zoom;
    },
    get isTall() {
      return graph.isTall;
    },
    setZoom(zoom) {
      graph.zoom = zoom;
      render();
    },
    setTall(isTall) {
      graph.isTall = isTall;
      render();
    },
  };
}

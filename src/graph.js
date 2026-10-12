import { clamp, hasGain, qRange, qStepRatio, responseDb } from "./shared/filters.js";

const rangeDb = 15;
const ticksHz = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000];
const majorTicksHz = [100, 1000, 10_000];
const zooms = { all: [20, 20_000], lows: [20, 400], mids: [200, 5000], highs: [2000, 20_000] };
const offlineContext = new OfflineAudioContext(1, 1, 48_000);

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

export function hzLabel(frequencyHz) {
  if (frequencyHz >= 1000) return `${Math.round(frequencyHz / 100) / 10}k`;
  return `${Math.round(frequencyHz)}`;
}

export function signedDb(gainDb) {
  return `${gainDb > 0 ? "+" : ""}${gainDb.toFixed(1)}`;
}

export function octavesFromQ(q) {
  return (2 / Math.LN2) * Math.asinh(1 / (2 * q));
}

function qFromOctaves(octaves) {
  return 1 / (2 * Math.sinh((Math.LN2 / 2) * octaves));
}

// The engine sends 128 points from 20 Hz to 20 kHz on a log scale.
function spectrumAt(spectrumDb, frequencyHz) {
  const position = (Math.log(frequencyHz / 20) / Math.log(1000)) * (spectrumDb.length - 1);
  return spectrumDb[clamp(Math.round(position), 0, spectrumDb.length - 1)];
}

// hooks: bands(), curveBands(), spectrum(), selected(), isBypassed(), select(index), changed(),
// addBand(frequencyHz, gainDb). A graph that is not interactive draws no points and takes no input.
export function makeGraph(host, options, hooks) {
  const graph = { zoom: "all", vertical: false, hover: null, drag: null, nodes: [], handles: [] };
  const clipId = `clip-${host.id}`;

  function box() {
    const height = graph.vertical ? options.tallHeight : options.height;
    const top = graph.vertical ? 16 : 8;
    const bottom = graph.vertical ? 6 : 16;
    return { width: host.clientWidth, height, left: 30, top, plotWidth: host.clientWidth - 38, plotHeight: height - top - bottom };
  }

  function ratioOf(frequencyHz) {
    const [lowHz, highHz] = zooms[graph.zoom];
    return Math.log(frequencyHz / lowHz) / Math.log(highHz / lowHz);
  }

  function frequencyAt(ratio) {
    const [lowHz, highHz] = zooms[graph.zoom];
    return clamp(lowHz * (highHz / lowHz) ** ratio, 20, 20_000);
  }

  function place(frequencyHz, gainDb, size) {
    const along = ratioOf(frequencyHz);
    const across = (clamp(gainDb, -rangeDb, rangeDb) + rangeDb) / (2 * rangeDb);
    if (graph.vertical) return { x: size.left + (across * size.plotWidth), y: size.top + (along * size.plotHeight) };
    return { x: size.left + (along * size.plotWidth), y: size.top + ((1 - across) * size.plotHeight) };
  }

  function read(x, y, size) {
    const along = graph.vertical ? (y - size.top) / size.plotHeight : (x - size.left) / size.plotWidth;
    const across = graph.vertical ? (x - size.left) / size.plotWidth : 1 - ((y - size.top) / size.plotHeight);
    return { frequencyHz: frequencyAt(along), gainDb: clamp((across * 2 * rangeDb) - rangeDb, -rangeDb, rangeDb) };
  }

  function line(from, to, style) {
    return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" ${style}/>`;
  }

  function text(point, content, style) {
    return `<text x="${point.x}" y="${point.y}" fill="rgba(255,255,255,0.45)" font-size="9" ${style}>${content}</text>`;
  }

  // The two ends of the gain axis at one frequency.
  function edges(frequencyHz, size) {
    return [place(frequencyHz, -rangeDb, size), place(frequencyHz, rangeDb, size)];
  }

  function sweep() {
    return Float32Array.from({ length: 121 }, (_, index) => frequencyAt(index / 120));
  }

  function trace(frequencies, valuesDb, size) {
    return Array.from(frequencies, (frequencyHz, index) => {
      const point = place(frequencyHz, valuesDb[index], size);
      return `${point.x},${point.y}`;
    });
  }

  function drawRegions(size) {
    return regions.map((region, index) => {
      const start = place(Math.max(region.lowHz, zooms[graph.zoom][0]), rangeDb, size);
      const end = place(Math.min(region.highHz, zooms[graph.zoom][1]), -rangeDb, size);
      const length = graph.vertical ? end.y - start.y : end.x - start.x;
      if (length <= 0) return "";
      const fill = index % 2 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0)";
      const rect = graph.vertical
        ? `<rect x="${size.left}" y="${start.y}" width="${size.plotWidth}" height="${length}" fill="${fill}"/>`
        : `<rect x="${start.x}" y="${size.top}" width="${length}" height="${size.plotHeight}" fill="${fill}"/>`;
      if (length < 40) return rect;
      const tallSpot = { x: size.left + size.plotWidth - 4, y: start.y + (length / 2) + 3 };
      const wideSpot = { x: start.x + (length / 2), y: size.top + 10 };
      const anchor = graph.vertical ? "end" : "middle";
      return rect + text(graph.vertical ? tallSpot : wideSpot, region.name, `text-anchor="${anchor}" fill-opacity="0.8"`);
    }).join("");
  }

  function drawFrequencyGrid(size) {
    const parts = [];
    let lastLabelAt = -Infinity;
    for (const frequencyHz of ticksHz) {
      const ratio = ratioOf(frequencyHz);
      if (ratio < -0.001 || ratio > 1.001) continue;
      const [low, high] = edges(frequencyHz, size);
      const opacity = majorTicksHz.includes(frequencyHz) ? 0.13 : 0.05;
      parts.push(line(low, high, `stroke="rgba(255,255,255,${opacity})"`));
      const labelAt = graph.vertical ? low.y : low.x;
      if (labelAt - lastLabelAt < 26) continue;
      lastLabelAt = labelAt;
      const spot = graph.vertical ? { x: 4, y: low.y + 3 } : { x: low.x, y: size.height - 4 };
      parts.push(text(spot, hzLabel(frequencyHz), `text-anchor="${graph.vertical ? "start" : "middle"}"`));
    }
    return parts.join("");
  }

  function drawGainGrid(size) {
    const parts = [];
    for (const gainDb of [-12, -6, 0, 6, 12]) {
      const from = place(zooms[graph.zoom][0], gainDb, size);
      const to = place(zooms[graph.zoom][1], gainDb, size);
      parts.push(line(from, to, `stroke="rgba(255,255,255,${gainDb === 0 ? 0.22 : 0.05})"`));
      const spot = graph.vertical ? { x: from.x, y: 11 } : { x: 4, y: from.y + 3 };
      parts.push(text(spot, gainDb > 0 ? `+${gainDb}` : `${gainDb}`, `text-anchor="${graph.vertical ? "middle" : "start"}"`));
    }
    return parts.join("");
  }

  function drawSpectrum(size, frequencies) {
    const spectrumDb = hooks.spectrum();
    if (spectrumDb.length === 0) return "";
    if (graph.vertical) return drawMirroredSpectrum(size, frequencies, spectrumDb);

    // The fill starts at the floor and runs up. The floor is 100 dB below full scale, which puts a
    // normal song around the middle with its peaks in the upper half.
    const floorDb = -100;
    // Array.from, not map. A Float32Array.map would turn each point string into a number.
    const points = Array.from(frequencies, (frequencyHz, index) => {
      const level = clamp((spectrumAt(spectrumDb, frequencyHz) - floorDb) / (0 - floorDb), 0, 1);
      return `${size.left + ((index / 120) * size.plotWidth)},${size.top + (size.plotHeight * (1 - level))}`;
    });
    const floor = [`${size.left + size.plotWidth},${size.top + size.plotHeight}`, `${size.left},${size.top + size.plotHeight}`];
    return `<polygon points="${[...points, ...floor].join(" ")}" fill="rgba(150,165,200,0.13)"/>`;
  }

  // The Tall view stays even on both sides of the center line, with the 3 dB per octave slope that
  // stands the spectrum upright.
  function drawMirroredSpectrum(size, frequencies, spectrumDb) {
    const rise = size.plotWidth * 0.45;
    const right = [];
    const left = [];
    for (const frequencyHz of frequencies) {
      const levelDb = spectrumAt(spectrumDb, frequencyHz) + (3 * Math.log2(frequencyHz / 1000));
      const halfWidth = clamp((levelDb + 100) / 90, 0, 1) * rise;
      const center = place(frequencyHz, 0, size);
      right.push(`${center.x + halfWidth},${center.y}`);
      left.unshift(`${center.x - halfWidth},${center.y}`);
    }
    return `<polygon points="${[...right, ...left].join(" ")}" fill="rgba(150,165,200,0.13)"/>`;
  }

  function drawLoudness(size, frequencies, curveDb) {
    const start = place(frequencies[0], 0, size);
    const end = place(frequencies.at(-1), 0, size);
    const area = (pick, color) => {
      const edge = trace(frequencies, curveDb.map((valueDb) => pick(valueDb, 0)), size);
      return `<polygon points="${start.x},${start.y} ${edge.join(" ")} ${end.x},${end.y}" fill="${color}"/>`;
    };
    return area(Math.max, "rgba(255,122,144,0.24)") + area(Math.min, "rgba(79,163,255,0.24)");
  }

  function drawSelected(size, band, frequencies) {
    const start = place(frequencies[0], 0, size);
    const end = place(frequencies.at(-1), 0, size);
    const points = trace(frequencies, responseDb(offlineContext, [{ ...band, on: true }], frequencies), size);
    const area = `<polygon points="${start.x},${start.y} ${points.join(" ")} ${end.x},${end.y}" fill="${typeColor[band.type]}" fill-opacity="0.18"/>`;
    if (band.type !== "PK") return area;

    const halfOctaves = octavesFromQ(band.q) / 2;
    const sidesHz = Float32Array.from([-1, 1], (side) => band.frequencyHz * (2 ** (side * halfOctaves)));
    const sidesDb = responseDb(offlineContext, [{ ...band, on: true }], sidesHz);
    const parts = [area];
    sidesHz.forEach((frequencyHz, index) => {
      const [low, high] = edges(frequencyHz, size);
      const handle = place(frequencyHz, sidesDb[index], size);
      parts.push(line(low, high, `stroke="${typeColor.PK}" stroke-opacity="0.55" stroke-dasharray="3 3"`));
      parts.push(`<rect x="${handle.x - 5}" y="${handle.y - 5}" width="10" height="10" rx="2" fill="#0e1013" stroke="${typeColor.PK}" stroke-width="2"/>`);
      graph.handles.push(handle);
    });
    return parts.join("");
  }

  function drawNodes(size) {
    return hooks.bands().map((band, index) => {
      const point = place(band.frequencyHz, hasGain(band.type) ? band.gainDb : 0, size);
      graph.nodes.push({ index, x: point.x, y: point.y });
      const fill = band.on ? typeColor[band.type] : "#0e1013";
      const ring = index === hooks.selected() ? `<circle cx="${point.x}" cy="${point.y}" r="11" fill="none" stroke="#fff" stroke-opacity="0.7"/>` : "";
      return `${ring}<circle cx="${point.x}" cy="${point.y}" r="7" fill="${fill}" stroke="${typeColor[band.type]}" stroke-width="1.5"/>`
        + `<text x="${point.x}" y="${point.y + 3}" text-anchor="middle" font-size="9" font-weight="700" fill="#0e1013">${index + 1}</text>`;
    }).join("");
  }

  function drawPill(size, band) {
    const point = place(band.frequencyHz, hasGain(band.type) ? band.gainDb : 0, size);
    const gain = hasGain(band.type) ? `${signedDb(band.gainDb)} dB  ` : "";
    const content = `${hzLabel(band.frequencyHz)} Hz  ${gain}Q ${band.q.toFixed(2)}`;
    const width = (content.length * 5.6) + 12;
    const x = clamp(point.x - (width / 2), 2, size.width - width - 2);
    const y = point.y > size.top + 30 ? point.y - 30 : point.y + 16;
    return `<rect x="${x}" y="${y}" width="${width}" height="16" rx="8" fill="#0e1013" stroke="${typeColor[band.type]}"/>`
      + `<text x="${x + (width / 2)}" y="${y + 11}" text-anchor="middle" font-size="9.5" fill="#e6e9ef">${content}</text>`;
  }

  function drawHover(size) {
    if (!graph.hover || graph.drag) return "";
    const reading = read(graph.hover.x, graph.hover.y, size);
    const [valueDb] = responseDb(offlineContext, hooks.curveBands(), Float32Array.of(reading.frequencyHz));
    const [low, high] = edges(reading.frequencyHz, size);
    const dot = place(reading.frequencyHz, valueDb, size);
    const content = `${hzLabel(reading.frequencyHz)} Hz  ${signedDb(valueDb)} dB`;
    const width = (content.length * 5.6) + 10;
    const x = size.left + size.plotWidth - width;
    const y = size.top + (graph.vertical ? 2 : 16);
    return line(low, high, `stroke="rgba(255,255,255,0.25)"`)
      + `<circle cx="${dot.x}" cy="${dot.y}" r="3" fill="#fff"/>`
      + `<rect x="${x}" y="${y}" width="${width}" height="15" rx="4" fill="rgba(14,16,19,0.9)"/>`
      + `<text x="${x + 5}" y="${y + 11}" font-size="9.5" fill="#e6e9ef">${content}</text>`;
  }

  function render() {
    const size = box();
    if (size.width === 0) return;
    const frequencies = sweep();
    const curveDb = responseDb(offlineContext, hooks.curveBands(), frequencies);
    const band = hooks.bands()[hooks.selected()];
    const showsPoints = options.interactive;
    graph.handles = [];
    graph.nodes = [];

    const selected = showsPoints && band ? drawSelected(size, band, frequencies) : "";
    const curveColor = hooks.isBypassed() ? "rgba(255,255,255,0.35)" : "#5b8cff";
    const curve = `<polyline points="${trace(frequencies, curveDb, size).join(" ")}" fill="none" stroke="${curveColor}" stroke-width="2"/>`;
    const nodes = showsPoints ? drawNodes(size) : "";
    const pill = showsPoints && band ? drawPill(size, band) : "";
    host.innerHTML = `<svg viewBox="0 0 ${size.width} ${size.height}" height="${size.height}">
      <defs><clipPath id="${clipId}"><rect x="${size.left}" y="${size.top}" width="${size.plotWidth}" height="${size.plotHeight}"/></clipPath></defs>
      ${options.regions === false ? "" : drawRegions(size)}${drawFrequencyGrid(size)}${drawGainGrid(size)}
      <g clip-path="url(#${clipId})">${drawSpectrum(size, frequencies)}${drawLoudness(size, frequencies, curveDb)}${selected}${curve}</g>
      ${nodes}${pill}${drawHover(size)}
    </svg>`;
  }

  function pointerOf(event) {
    const bounds = host.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top, size: box() };
  }

  function hit(point) {
    const isNear = (item, radius) => Math.hypot(item.x - point.x, item.y - point.y) < radius;
    if (graph.handles.some((handle) => isNear(handle, 12))) return { kind: "width", index: hooks.selected() };
    const node = [...graph.nodes].reverse().find((item) => isNear(item, 14));
    return node ? { kind: "move", index: node.index } : null;
  }

  // A point moves from where it was grabbed, so it never jumps under the pointer. Shift moves it a
  // quarter as far, for fine steps on a narrow panel.
  function moveBand(band, point, isFine) {
    const scale = isFine ? 0.25 : 1;
    const start = place(graph.drag.startHz, graph.drag.startDb, point.size);
    const target = read(start.x + ((point.x - graph.drag.startX) * scale), start.y + ((point.y - graph.drag.startY) * scale), point.size);
    band.frequencyHz = Math.round(target.frequencyHz);
    if (hasGain(band.type)) band.gainDb = Math.round(target.gainDb * 10) / 10;
  }

  function widenBand(band, point) {
    const octaves = 2 * Math.abs(Math.log2(read(point.x, point.y, point.size).frequencyHz / band.frequencyHz));
    band.q = clamp(qFromOctaves(Math.max(octaves, 0.05)), ...qRange);
  }

  if (options.interactive) {
    host.addEventListener("pointerdown", (event) => {
      const point = pointerOf(event);
      const target = hit(point);
      if (!target) return;
      const band = hooks.bands()[target.index];
      graph.drag = { ...target, startX: point.x, startY: point.y, startHz: band.frequencyHz, startDb: hasGain(band.type) ? band.gainDb : 0 };
      host.setPointerCapture(event.pointerId);
      hooks.select(target.index);
    });

    host.addEventListener("pointermove", (event) => {
      const point = pointerOf(event);
      graph.hover = point;
      if (!graph.drag) {
        render();
        return;
      }
      const band = hooks.bands()[graph.drag.index];
      // A press only selects. The point moves once the pointer has gone 5 px, counted from there.
      if (!graph.drag.isMoving) {
        const deadZonePx = 5;
        if (Math.hypot(point.x - graph.drag.startX, point.y - graph.drag.startY) < deadZonePx) return;
        graph.drag.isMoving = true;
        graph.drag.startX = point.x;
        graph.drag.startY = point.y;
      }
      if (graph.drag.kind === "move") moveBand(band, point, event.shiftKey);
      else widenBand(band, point);
      hooks.changed();
    });

    host.addEventListener("pointerup", () => {
      graph.drag = null;
      render();
    });

    host.addEventListener("pointerleave", () => {
      graph.hover = null;
      if (!graph.drag) render();
    });

    host.addEventListener("dblclick", (event) => {
      const point = pointerOf(event);
      if (hit(point)) return;
      const reading = read(point.x, point.y, point.size);
      hooks.addBand(Math.round(reading.frequencyHz), Math.round(reading.gainDb * 10) / 10);
    });

    host.addEventListener("wheel", (event) => {
      const target = hit(pointerOf(event));
      if (!target) return;
      event.preventDefault();
      const band = hooks.bands()[target.index];
      band.q = clamp(band.q * (event.deltaY < 0 ? qStepRatio : 1 / qStepRatio), ...qRange);
      hooks.select(target.index);
      hooks.changed();
    }, { passive: false });
  }

  new ResizeObserver(render).observe(host);

  return {
    render,
    get zoom() {
      return graph.zoom;
    },
    get vertical() {
      return graph.vertical;
    },
    setZoom(zoom) {
      graph.zoom = zoom;
      render();
    },
    setVertical(vertical) {
      graph.vertical = vertical;
      render();
    },
  };
}

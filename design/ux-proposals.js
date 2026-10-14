const sampleRateHz = 48_000;
const rangeDb = 15;
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

const typeColor = { PK: "#b06bff", LSC: "#2ec4b6", HSC: "#2ec4b6", HP: "#ff9f43", LP: "#ff9f43" };
const typeName = { PK: "Peak", LSC: "Low shelf", HSC: "High shelf", HP: "Low cut", LP: "High cut" };
const zooms = { all: [20, 20_000], lows: [20, 400], mids: [200, 5000], highs: [2000, 20_000] };
const layerColor = { headphone: "#a9b8ff", ear: "#ffd166" };
const earText = "Preamp: 0.0 dB\nFilter 1: ON PK Fc 94 Hz Gain -5.0 dB Q 1.60\nFilter 2: ON PK Fc 7732 Hz Gain -3.0 dB Q 2.85";

const headphoneBands = [
  { on: true, type: "LSC", frequencyHz: 105, gainDb: -2.6, q: 0.7 },
  { on: true, type: "PK", frequencyHz: 250, gainDb: -2.5, q: 1.13 },
  { on: true, type: "PK", frequencyHz: 539, gainDb: 1.6, q: 2.6 },
  { on: true, type: "PK", frequencyHz: 4491, gainDb: 3.3, q: 5.83 },
  { on: true, type: "PK", frequencyHz: 5617, gainDb: 6, q: 2.71 },
  { on: true, type: "HSC", frequencyHz: 10_000, gainDb: 1.1, q: 0.7 },
];

const library = [
  { section: "Saved", name: "Night listening", bands: [{ on: true, type: "HSC", frequencyHz: 6000, gainDb: -3, q: 0.7 }] },
  { section: "Saved", name: "Podcast voice", bands: [{ on: true, type: "HP", frequencyHz: 90, gainDb: 0, q: 0.7 }, { on: true, type: "PK", frequencyHz: 3000, gainDb: 2.5, q: 1 }] },
  { section: "AutoEQ headphones", name: "AKG N700NC M2", bands: headphoneBands },
  { section: "AutoEQ headphones", name: "Sennheiser HD 600", bands: [{ on: true, type: "LSC", frequencyHz: 105, gainDb: 6.5, q: 0.7 }, { on: true, type: "PK", frequencyHz: 2800, gainDb: -2, q: 2 }, { on: true, type: "HSC", frequencyHz: 10_000, gainDb: 2, q: 0.7 }] },
  { section: "AutoEQ headphones", name: "Sony WH-1000XM4", bands: [{ on: true, type: "LSC", frequencyHz: 105, gainDb: -4.2, q: 0.7 }, { on: true, type: "PK", frequencyHz: 3500, gainDb: 4, q: 1.8 }] },
  { section: "Starter sounds", name: "Flat", bands: [] },
  { section: "Starter sounds", name: "Warm", bands: [{ on: true, type: "LSC", frequencyHz: 120, gainDb: 3, q: 0.7 }, { on: true, type: "HSC", frequencyHz: 8000, gainDb: -2, q: 0.7 }] },
  { section: "Starter sounds", name: "Clear vocals", bands: [{ on: true, type: "PK", frequencyHz: 2500, gainDb: 3, q: 1 }] },
];

const graphs = [];
let tickCount = 0;

function clampNumber(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

function hasGain(type) {
  return type === "PK" || type === "LSC" || type === "HSC";
}

function hzLabel(frequencyHz) {
  if (frequencyHz >= 1000) return `${Math.round(frequencyHz / 100) / 10}k`;
  return `${Math.round(frequencyHz)}`;
}

function signedDb(gainDb) {
  return `${gainDb > 0 ? "+" : ""}${gainDb.toFixed(1)}`;
}

// b0 b1 b2 a0 a1 a2 from the RBJ Audio EQ Cookbook
function coefficients(band) {
  const omega = (2 * Math.PI * band.frequencyHz) / sampleRateHz;
  const cosine = Math.cos(omega);
  const alpha = Math.sin(omega) / (2 * band.q);
  const amplitude = 10 ** ((band.gainDb || 0) / 40);
  const root = 2 * Math.sqrt(amplitude) * alpha;
  const up = amplitude + 1;
  const down = amplitude - 1;
  const formulas = {
    PK: () => [1 + alpha * amplitude, -2 * cosine, 1 - alpha * amplitude, 1 + alpha / amplitude, -2 * cosine, 1 - alpha / amplitude],
    LSC: () => [
      amplitude * (up - down * cosine + root), 2 * amplitude * (down - up * cosine), amplitude * (up - down * cosine - root),
      up + down * cosine + root, -2 * (down + up * cosine), up + down * cosine - root,
    ],
    HSC: () => [
      amplitude * (up + down * cosine + root), -2 * amplitude * (down + up * cosine), amplitude * (up + down * cosine - root),
      up - down * cosine + root, 2 * (down - up * cosine), up - down * cosine - root,
    ],
    HP: () => [(1 + cosine) / 2, -(1 + cosine), (1 + cosine) / 2, 1 + alpha, -2 * cosine, 1 - alpha],
    LP: () => [(1 - cosine) / 2, 1 - cosine, (1 - cosine) / 2, 1 + alpha, -2 * cosine, 1 - alpha],
  };

  return formulas[band.type]();
}

function bandDb(band, frequencyHz) {
  const [b0, b1, b2, a0, a1, a2] = coefficients(band);
  const omega = (2 * Math.PI * frequencyHz) / sampleRateHz;
  const real = (c0, c1, c2) => c0 + c1 * Math.cos(omega) + c2 * Math.cos(2 * omega);
  const imaginary = (c1, c2) => -(c1 * Math.sin(omega) + c2 * Math.sin(2 * omega));
  const top = Math.hypot(real(b0, b1, b2), imaginary(b1, b2));
  const bottom = Math.hypot(real(a0, a1, a2), imaginary(a1, a2));

  return 20 * Math.log10(top / bottom);
}

function octavesFromQ(q) {
  return (2 / Math.LN2) * Math.asinh(1 / (2 * q));
}

function qFromOctaves(octaves) {
  return 1 / (2 * Math.sinh((Math.LN2 / 2) * octaves));
}

function spectrumDb(frequencyHz) {
  const octave = Math.log2(frequencyHz / 20);
  const tilt = -22 - octave * 3.2;
  const kick = 10 * Math.exp(-2 * Math.log2(frequencyHz / 70) ** 2);
  const voice = 7 * Math.exp(-(Math.log2(frequencyHz / 1800) ** 2));
  const rolloff = frequencyHz > 16_000 ? -(frequencyHz - 16_000) / 200 : 0;
  const wobble = 3 * Math.sin(octave * 3.1 + tickCount * 0.7) + 2 * Math.sin(octave * 7.3 - tickCount * 1.3);

  return Math.max(tilt + kick + voice + rolloff + wobble, -90);
}

// Reads "Filter 1: ON PK Fc 94 Hz Gain -5.0 dB Q 1.60" lines, as the extension does.
function parseAutoEqText(text, layer) {
  const bands = [];
  for (const line of text.split("\n")) {
    const words = line.trim().split(" ").filter((word) => word !== "");
    if ((words[0] || "").toLowerCase() !== "filter") continue;
    const readAfter = (name) => Number(words[words.findIndex((word) => word.toLowerCase() === name) + 1]);
    bands.push({ on: words[2] === "ON", type: words[3], frequencyHz: readAfter("fc"), gainDb: readAfter("gain") || 0, q: readAfter("q") || 0.71, layer });
  }

  return bands;
}

function makeModel(bands, profile) {
  const model = {
    bands: bands.map((band) => ({ ...band })),
    profile,
    selected: -1,
    solo: -1,
    macros: { bass: 0, vocals: 0, treble: 0 },
    enabled: true,
    bypass: false,
    listeners: [],
  };
  model.changed = () => model.listeners.forEach((listener) => listener());

  return model;
}

function curveBands(model) {
  if (model.bypass || !model.enabled) return [];
  if (model.solo >= 0 && model.bands[model.solo]) return [model.bands[model.solo]];
  const isLayerOn = (band) => !band.layer || Boolean(model.layers && model.layers[band.layer] && model.layers[band.layer].on);
  const list = model.bands.filter((band) => band.on && isLayerOn(band));
  const { bass, vocals, treble } = model.macros;
  if (bass) list.push({ type: "LSC", frequencyHz: 105, gainDb: bass, q: 0.7 });
  if (vocals) list.push({ type: "PK", frequencyHz: 2500, gainDb: vocals, q: 0.9 });
  if (treble) list.push({ type: "HSC", frequencyHz: 8000, gainDb: treble, q: 0.7 });

  return list;
}

function curveDb(model, frequencyHz) {
  return curveBands(model).reduce((total, band) => total + bandDb(band, frequencyHz), 0);
}

function maxBoostDb(model) {
  let max = 0;
  for (let index = 0; index <= 80; index += 1) max = Math.max(max, curveDb(model, 20 * 1000 ** (index / 80)));
  return max;
}

function makeGraph(host, model, options) {
  const graph = { zoom: "all", vertical: Boolean(options.vertical), hover: null, drag: null, nodes: [], handles: [] };
  const clipId = `clip-${graphs.length}`;
  host.classList.add("graph");

  function box() {
    const width = host.clientWidth || 338;
    const height = graph.vertical ? options.tallHeight || 440 : options.height;
    const top = graph.vertical ? 16 : 8;
    const bottom = graph.vertical ? 6 : 16;
    return { width, height, left: 30, top, plotWidth: width - 38, plotHeight: height - top - bottom };
  }

  function ratioOf(frequencyHz) {
    const [lowHz, highHz] = zooms[graph.zoom];
    return Math.log(frequencyHz / lowHz) / Math.log(highHz / lowHz);
  }

  function frequencyAt(ratio) {
    const [lowHz, highHz] = zooms[graph.zoom];
    return clampNumber(lowHz * (highHz / lowHz) ** ratio, 20, 20_000);
  }

  function place(frequencyHz, gainDb, size) {
    const along = ratioOf(frequencyHz);
    const across = (clampNumber(gainDb, -rangeDb, rangeDb) + rangeDb) / (2 * rangeDb);
    if (graph.vertical) return { x: size.left + across * size.plotWidth, y: size.top + along * size.plotHeight };
    return { x: size.left + along * size.plotWidth, y: size.top + (1 - across) * size.plotHeight };
  }

  function read(x, y, size) {
    const along = graph.vertical ? (y - size.top) / size.plotHeight : (x - size.left) / size.plotWidth;
    const across = graph.vertical ? (x - size.left) / size.plotWidth : 1 - (y - size.top) / size.plotHeight;
    return { frequencyHz: frequencyAt(along), gainDb: clampNumber(across * 2 * rangeDb - rangeDb, -rangeDb, rangeDb) };
  }

  function line(from, to, style) {
    return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" ${style}/>`;
  }

  function text(point, content, style) {
    return `<text x="${point.x}" y="${point.y}" fill="rgba(255,255,255,0.45)" font-size="9" ${style}>${content}</text>`;
  }

  // The far edge of the plot along the gain axis, at one frequency.
  function edges(frequencyHz, size) {
    return [place(frequencyHz, -rangeDb, size), place(frequencyHz, rangeDb, size)];
  }

  function drawRegions(size) {
    if (!options.regions) return "";
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
      const middle = graph.vertical ? { x: size.left + size.plotWidth - 4, y: start.y + length / 2 + 3 } : { x: start.x + length / 2, y: size.top + 10 };
      return rect + text(middle, region.name, `text-anchor="${graph.vertical ? "end" : "middle"}" fill-opacity="0.8"`);
    }).join("");
  }

  function drawGrid(size) {
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
    for (const gainDb of [-12, -6, 0, 6, 12]) {
      const from = place(zooms[graph.zoom][0], gainDb, size);
      const to = place(zooms[graph.zoom][1], gainDb, size);
      parts.push(line(from, to, `stroke="rgba(255,255,255,${gainDb === 0 ? 0.22 : 0.05})"`));
      const label = gainDb > 0 ? `+${gainDb}` : `${gainDb}`;
      const spot = graph.vertical ? { x: from.x, y: 11 } : { x: 4, y: from.y + 3 };
      parts.push(text(spot, label, `text-anchor="${graph.vertical ? "middle" : "start"}"`));
    }
    return parts.join("");
  }

  // Music falls about 3 dB per octave. Adding it back and mirroring at 0 dB stands the spectrum upright.
  function drawMirroredSpectrum(size) {
    const right = [];
    const left = [];
    for (let index = 0; index <= 90; index += 1) {
      const frequencyHz = frequencyAt(index / 90);
      const levelDb = spectrumDb(frequencyHz) + 3 * Math.log2(frequencyHz / 1000);
      const halfWidth = clampNumber((levelDb + 60) / 40, 0, 1) * size.plotWidth * 0.45;
      const center = place(frequencyHz, 0, size);
      right.push(`${center.x + halfWidth},${center.y}`);
      left.unshift(`${center.x - halfWidth},${center.y}`);
    }
    return `<polygon points="${[...right, ...left].join(" ")}" fill="rgba(150,165,200,0.13)"/>`;
  }

  function drawLoudness(size) {
    if (model.bypass || !model.enabled) return "";
    const start = place(zooms[graph.zoom][0], 0, size);
    const end = place(zooms[graph.zoom][1], 0, size);
    const area = (pick, color) => {
      const edge = trace((frequencyHz) => pick(curveDb(model, frequencyHz), 0), size);
      return `<polygon points="${start.x},${start.y} ${edge.join(" ")} ${end.x},${end.y}" fill="${color}"/>`;
    };
    return area(Math.max, "rgba(255,122,144,0.24)") + area(Math.min, "rgba(79,163,255,0.24)");
  }

  function drawSpectrum(size) {
    if (graph.vertical) return drawMirroredSpectrum(size);
    const points = [];
    for (let index = 0; index <= 90; index += 1) {
      const level = (spectrumDb(frequencyAt(index / 90)) + 90) / 80;
      const along = index / 90;
      if (graph.vertical) points.push(`${size.left + level * size.plotWidth * 0.8},${size.top + along * size.plotHeight}`);
      else points.push(`${size.left + along * size.plotWidth},${size.top + size.plotHeight * (1 - level * 0.8)}`);
    }
    const floor = graph.vertical
      ? [`${size.left},${size.top + size.plotHeight}`, `${size.left},${size.top}`]
      : [`${size.left + size.plotWidth},${size.top + size.plotHeight}`, `${size.left},${size.top + size.plotHeight}`];
    return `<polygon points="${[...points, ...floor].join(" ")}" fill="rgba(91,140,255,0.12)"/>`;
  }

  function trace(valueAt, size) {
    const points = [];
    for (let index = 0; index <= 120; index += 1) {
      const frequencyHz = frequencyAt(index / 120);
      const point = place(frequencyHz, valueAt(frequencyHz), size);
      points.push(`${point.x},${point.y}`);
    }
    return points;
  }

  function drawSelected(size, band) {
    const start = place(zooms[graph.zoom][0], 0, size);
    const end = place(zooms[graph.zoom][1], 0, size);
    const points = trace((frequencyHz) => bandDb(band, frequencyHz), size);
    const area = `<polygon points="${start.x},${start.y} ${points.join(" ")} ${end.x},${end.y}" fill="${typeColor[band.type]}" fill-opacity="0.18"/>`;
    graph.handles = [];
    if (band.type !== "PK") return area;

    const halfOctaves = octavesFromQ(band.q) / 2;
    const parts = [area];
    for (const side of [-1, 1]) {
      const frequencyHz = band.frequencyHz * 2 ** (side * halfOctaves);
      const [low, high] = edges(frequencyHz, size);
      const handle = place(frequencyHz, bandDb(band, frequencyHz), size);
      parts.push(line(low, high, `stroke="${typeColor.PK}" stroke-opacity="0.55" stroke-dasharray="3 3"`));
      parts.push(`<rect x="${handle.x - 5}" y="${handle.y - 5}" width="10" height="10" rx="2" fill="#0e1013" stroke="${typeColor.PK}" stroke-width="2"/>`);
      graph.handles.push(handle);
    }
    return parts.join("");
  }

  function drawNodes(size) {
    graph.nodes = [];
    if (!options.showNodes) return "";
    return model.bands.map((band, index) => {
      const point = place(band.frequencyHz, hasGain(band.type) ? band.gainDb : 0, size);
      graph.nodes.push({ index, x: point.x, y: point.y });
      const isSelected = index === model.selected;
      const fill = band.on ? typeColor[band.type] : "#0e1013";
      const ring = isSelected ? `<circle cx="${point.x}" cy="${point.y}" r="11" fill="none" stroke="#fff" stroke-opacity="0.7"/>` : "";
      const earRing = band.layer === "ear" ? `<circle cx="${point.x}" cy="${point.y}" r="9" fill="none" stroke="${layerColor.ear}" stroke-width="1.5"/>` : "";
      return `${earRing}${ring}<circle cx="${point.x}" cy="${point.y}" r="7" fill="${fill}" stroke="${typeColor[band.type]}" stroke-width="1.5"/>`
        + `<text x="${point.x}" y="${point.y + 3}" text-anchor="middle" font-size="9" font-weight="700" fill="#0e1013">${index + 1}</text>`;
    }).join("");
  }

  function drawPill(size) {
    const band = model.bands[model.selected];
    if (!options.showNodes || !band) return "";
    const point = place(band.frequencyHz, hasGain(band.type) ? band.gainDb : 0, size);
    const content = `${hzLabel(band.frequencyHz)} Hz  ${hasGain(band.type) ? `${signedDb(band.gainDb)} dB  ` : ""}Q ${band.q.toFixed(2)}`;
    const width = content.length * 5.6 + 12;
    const x = clampNumber(point.x - width / 2, 2, size.width - width - 2);
    const y = point.y > size.top + 30 ? point.y - 30 : point.y + 16;
    return `<rect x="${x}" y="${y}" width="${width}" height="16" rx="8" fill="#0e1013" stroke="${typeColor[band.type]}"/>`
      + `<text x="${x + width / 2}" y="${y + 11}" text-anchor="middle" font-size="9.5" fill="#e6e9ef">${content}</text>`;
  }

  function drawHover(size) {
    if (!graph.hover || graph.drag) return "";
    const reading = read(graph.hover.x, graph.hover.y, size);
    const valueDb = curveDb(model, reading.frequencyHz);
    const [low, high] = edges(reading.frequencyHz, size);
    const dot = place(reading.frequencyHz, valueDb, size);
    const content = `${hzLabel(reading.frequencyHz)} Hz  ${signedDb(valueDb)} dB`;
    const width = content.length * 5.6 + 10;
    const x = size.left + size.plotWidth - width;
    return line(low, high, `stroke="rgba(255,255,255,0.25)"`)
      + `<circle cx="${dot.x}" cy="${dot.y}" r="3" fill="#fff"/>`
      + `<rect x="${x}" y="${size.top + (graph.vertical ? 2 : 16)}" width="${width}" height="15" rx="4" fill="rgba(14,16,19,0.9)"/>`
      + `<text x="${x + 5}" y="${size.top + (graph.vertical ? 13 : 27)}" font-size="9.5" fill="#e6e9ef">${content}</text>`;
  }

  // Each layer's own curve, dashed, under the solid total.
  function drawLayerCurves(size) {
    if (!options.layerCurves || !model.layers || model.bypass || !model.enabled) return "";
    return Object.entries(model.layers).filter(([, layer]) => layer.on).map(([key]) => {
      const bands = model.bands.filter((band) => band.on && band.layer === key);
      const points = trace((frequencyHz) => bands.reduce((total, band) => total + bandDb(band, frequencyHz), 0), size);
      return `<polyline points="${points.join(" ")}" fill="none" stroke="${layerColor[key]}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    }).join("");
  }

  function render() {
    const size = box();
    const band = model.bands[model.selected];
    const selected = options.showNodes && band ? drawSelected(size, band) : "";
    const curveColor = model.bypass || !model.enabled ? "rgba(255,255,255,0.35)" : "#5b8cff";
    const curve = `<polyline points="${trace((frequencyHz) => curveDb(model, frequencyHz), size).join(" ")}" fill="none" stroke="${curveColor}" stroke-width="2"/>`;
    if (!selected) graph.handles = [];
    host.innerHTML = `<svg viewBox="0 0 ${size.width} ${size.height}" height="${size.height}">
      <defs><clipPath id="${clipId}"><rect x="${size.left}" y="${size.top}" width="${size.plotWidth}" height="${size.plotHeight}"/></clipPath></defs>
      ${drawRegions(size)}${drawGrid(size)}
      <g clip-path="url(#${clipId})">${drawSpectrum(size)}${drawLoudness(size)}${selected}${drawLayerCurves(size)}${curve}</g>
      ${drawNodes(size)}${drawPill(size)}${drawHover(size)}
    </svg>`;
  }

  function pointerOf(event) {
    const bounds = host.getBoundingClientRect();
    const size = box();
    return { x: (event.clientX - bounds.left) * (size.width / bounds.width), y: (event.clientY - bounds.top) * (size.height / bounds.height), size };
  }

  function hit(point) {
    const isNear = (item, radius) => Math.hypot(item.x - point.x, item.y - point.y) < radius;
    if (graph.handles.some((handle) => isNear(handle, 12))) return { kind: "width", index: model.selected };
    const node = [...graph.nodes].reverse().find((item) => isNear(item, 14));
    return node ? { kind: "move", index: node.index } : null;
  }

  function moveBand(band, point, isFine) {
    const scale = isFine ? 0.25 : 1;
    const start = place(graph.drag.startHz, graph.drag.startDb, point.size);
    const target = read(start.x + (point.x - graph.drag.startX) * scale, start.y + (point.y - graph.drag.startY) * scale, point.size);
    band.frequencyHz = Math.round(target.frequencyHz);
    if (hasGain(band.type)) band.gainDb = Math.round(target.gainDb * 10) / 10;
  }

  if (options.interactive) {
    host.addEventListener("pointerdown", (event) => {
      const point = pointerOf(event);
      const target = hit(point);
      if (!target) return;
      const band = model.bands[target.index];
      model.selected = target.index;
      graph.drag = { ...target, startX: point.x, startY: point.y, startHz: band.frequencyHz, startDb: hasGain(band.type) ? band.gainDb : 0 };
      host.setPointerCapture(event.pointerId);
      model.changed();
    });

    host.addEventListener("pointermove", (event) => {
      const point = pointerOf(event);
      graph.hover = point;
      if (!graph.drag) {
        render();
        return;
      }
      const band = model.bands[graph.drag.index];
      if (graph.drag.kind === "move") moveBand(band, point, event.shiftKey);
      else band.q = clampNumber(qFromOctaves(Math.max(2 * Math.abs(Math.log2(read(point.x, point.y, point.size).frequencyHz / band.frequencyHz)), 0.05)), 0.2, 12);
      model.changed();
    });

    host.addEventListener("dblclick", (event) => {
      const point = pointerOf(event);
      if (hit(point)) return;
      const reading = read(point.x, point.y, point.size);
      model.bands.push({ on: true, type: "PK", frequencyHz: Math.round(reading.frequencyHz), gainDb: Math.round(reading.gainDb * 10) / 10, q: 1.41 });
      model.selected = model.bands.length - 1;
      model.changed();
    });

    host.addEventListener("wheel", (event) => {
      const target = hit(pointerOf(event));
      if (!target) return;
      event.preventDefault();
      const band = model.bands[target.index];
      band.q = clampNumber(band.q * (event.deltaY < 0 ? 1.12 : 1 / 1.12), 0.2, 12);
      model.selected = target.index;
      model.changed();
    }, { passive: false });
  }

  host.addEventListener("pointerup", () => {
    graph.drag = null;
    render();
  });
  host.addEventListener("pointerleave", () => {
    graph.hover = null;
    if (!graph.drag) render();
  });

  graph.render = render;
  graph.setOptions = (next) => {
    Object.assign(options, next);
    render();
  };
  model.listeners.push(render);
  graphs.push(graph);
  render();

  return graph;
}

function mount(host, model, draw, actions) {
  const update = () => {
    host.innerHTML = draw();
  };
  host.addEventListener("click", (event) => {
    const target = event.target.closest("[data-act]");
    if (!target || !host.contains(target)) return;
    actions[target.dataset.act](target.dataset.value);
    model.changed();
  });
  model.listeners.push(update);
  update();
}

function mountHeader(host, model) {
  const draw = () => {
    const boostDb = maxBoostDb(model);
    const level = model.bypass ? -15.9 : -14.1 + boostDb / 4;
    return `<div class="head-row">
        <span class="brand">goui</span>
        <button class="hold ${model.bypass ? "on" : ""}" data-hold title="Hold to hear the sound without the EQ">A/B</button>
        <button class="switch ${model.enabled ? "" : "off"}" data-act="power" title="EQ on or off"></button>
      </div>
      <div class="head-row">
        <span class="source"><span class="dot"></span>Ichiru | YouTube Music</span>
        <span title="Auto preamp keeps the peak under 0 dB"><span class="dot"></span><span class="level">${level.toFixed(1)}</span> dB</span>
      </div>`;
  };
  mount(host, model, draw, { power: () => { model.enabled = !model.enabled; } });
  host.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("[data-hold]")) return;
    model.bypass = true;
    model.changed();
  });
  const release = () => {
    if (!model.bypass) return;
    model.bypass = false;
    model.changed();
  };
  host.addEventListener("pointerup", release);
  host.addEventListener("pointerleave", release);
}

function mountProfile(host, model, onChange) {
  const draw = () => {
    const item = library.find((entry) => entry.name === model.profile);
    return `<div class="profile">
        <div><small>${item ? item.section : "Your sound"}</small><b>${model.profile}</b></div>
        <button data-act="change">Change</button>
      </div>`;
  };
  mount(host, model, draw, { change: onChange });
}

function mountLibrary(host, model, onPick) {
  host.innerHTML = `<input type="search" placeholder="Search your sounds and 8,850 headphones" />
    <div class="results"></div>
    <div class="library-actions">
      <button title="Save the current EQ under a name">Save</button>
      <button title="Load a ParametricEQ.txt or a JSON file">Import</button>
      <button title="Paste AutoEQ text or JSON">Paste</button>
      <button title="Copy as AutoEQ text or JSON">Export</button>
    </div>`;
  const input = host.querySelector("input");
  const results = host.querySelector(".results");
  const draw = () => {
    const query = input.value.trim().toLowerCase();
    const sections = ["Saved", "AutoEQ headphones", "Starter sounds"].map((section) => {
      const items = library.filter((item) => item.section === section && item.name.toLowerCase().includes(query));
      if (items.length === 0) return "";
      const buttons = items.map((item) => `<button class="item ${item.name === model.profile ? "on" : ""}" data-name="${item.name}"><span>${item.name}</span><small>${item.bands.length === 1 ? "1 band" : `${item.bands.length} bands`}</small></button>`);
      return `<h4>${section}</h4>${buttons.join("")}`;
    });
    results.innerHTML = sections.join("") || `<p class="hint">No sound by that name.</p>`;
  };
  input.addEventListener("input", draw);
  results.addEventListener("click", (event) => {
    const target = event.target.closest("[data-name]");
    if (!target) return;
    const item = library.find((entry) => entry.name === target.dataset.name);
    model.profile = item.name;
    model.bands = item.bands.map((band) => ({ ...band }));
    model.selected = -1;
    model.solo = -1;
    if (onPick) onPick();
    model.changed();
  });
  model.listeners.push(draw);
  draw();
}

function mountMacros(host, model, showSafety) {
  const rows = [["bass", "Bass", "Below 120 Hz"], ["vocals", "Vocals", "Around 2.5 kHz"], ["treble", "Treble", "Above 8 kHz"]];
  const sliders = rows.map(([key, label, hint]) => `<label class="macro">
      <span>${label}<small>${hint}</small></span>
      <input type="range" min="-6" max="6" step="0.5" value="0" data-key="${key}" />
      <output>0 dB</output>
    </label>`);
  const safety = `<div class="safety"><span>Stop clipping on its own</span><button class="switch" title="Auto preamp"></button></div>`;
  host.innerHTML = sliders.join("") + (showSafety === "preamp" ? `<div class="preamp-host"></div>` : "") + (showSafety === true ? safety : "");
  if (showSafety === "preamp") {
    const preampHost = host.querySelector(".preamp-host");
    const draw = () => {
      const preampDb = 0 - maxBoostDb(model);
      preampHost.innerHTML = `<div class="preamp-row">
          <span>Preamp<small>Auto</small></span>
          <input type="range" min="-24" max="12" step="0.1" value="${preampDb}" />
          <output>${signedDb(preampDb)} dB</output>
          <button class="on" title="Set the preamp from the largest boost of the total curve">Auto</button>
        </div>`;
    };
    model.listeners.push(draw);
    draw();
  }
  host.addEventListener("input", (event) => {
    const key = event.target.dataset.key;
    if (!key) return;
    model.macros[key] = Number(event.target.value);
    event.target.nextElementSibling.textContent = `${signedDb(model.macros[key])} dB`;
    model.changed();
  });
}

function mountChips(host, model) {
  const draw = () => {
    const chips = model.bands.map((band, index) => {
      const state = `${index === model.selected ? "on" : ""} ${band.on ? "" : "muted"}`;
      const startsLayer = band.layer && model.layers && model.layers[band.layer] && (index === 0 || model.bands[index - 1].layer !== band.layer);
      const label = startsLayer ? `<span class="chip-label" style="color:${layerColor[band.layer]}">${model.layers[band.layer].label}</span>` : "";
      return `${label}<button class="chip ${state}" data-act="select" data-value="${index}"><i style="background:${typeColor[band.type]}">${index + 1}</i>${hzLabel(band.frequencyHz)}</button>`;
    });
    return `<div class="chips">${chips.join("")}<button class="chip add" data-act="add">Add band</button></div>`;
  };
  mount(host, model, draw, {
    select: (value) => { model.selected = Number(value); },
    add: () => {
      model.bands.push({ on: true, type: "PK", frequencyHz: 1000, gainDb: 0, q: 1.41 });
      model.selected = model.bands.length - 1;
    },
  });
}

function qHint(band) {
  if (band.type === "PK") return `${octavesFromQ(band.q).toFixed(1)} octaves wide`;
  if (band.type === "HP" || band.type === "LP") return "steepness at the corner";
  return "slope of the shelf";
}

function stepperHtml(field, label, value, hint) {
  return `<div class="stepper">
      <button data-act="step" data-value="${field}:-1">-</button>
      <span>${value}<small>${label}${hint ? `, ${hint}` : ""}</small></span>
      <button data-act="step" data-value="${field}:1">+</button>
    </div>`;
}

function mountInspector(host, model, isCompact) {
  const types = isCompact
    ? [["PK", "Peak"], ["LSC", "Low"], ["HSC", "High"], ["HP", "Cut"]]
    : [["PK", "Peak"], ["LSC", "Low shelf"], ["HSC", "High shelf"], ["HP", "Low cut"], ["LP", "High cut"]];
  const draw = () => {
    const band = model.bands[model.selected];
    if (!band) return `<p class="hint">Tap a point or a chip to tune that band. Double click the graph to make a new band.</p>`;
    const segments = types.map(([type, label]) => `<button class="${band.type === type ? "on" : ""}" data-act="type" data-value="${type}">${label}</button>`);
    const gain = hasGain(band.type) ? stepperHtml("gain", "gain", `${signedDb(band.gainDb)} dB`) : stepperHtml("gain", "gain", "none");
    return `<div class="inspector-top">
        <b style="color:${typeColor[band.type]}">${band.layer && model.layers && model.layers[band.layer] ? `${model.layers[band.layer].label} · ` : ""}${model.selected + 1}. ${typeName[band.type]}</b>
        <button class="${band.on ? "on" : ""}" data-act="power">${band.on ? "On" : "Off"}</button>
        <button class="${model.solo === model.selected ? "on" : ""}" data-act="solo" title="Hear only this band">Solo</button>
        <button data-act="remove" title="Delete this band">Delete</button>
      </div>
      <div class="segments">${segments.join("")}</div>
      <div class="steppers ${isCompact ? "compact" : ""}">
        ${stepperHtml("frequency", "frequency", `${hzLabel(band.frequencyHz)} Hz`)}
        ${gain}
        ${stepperHtml("q", "Q", band.q.toFixed(2), isCompact ? "" : qHint(band))}
      </div>`;
  };
  const steps = {
    frequency: (band, direction) => { band.frequencyHz = Math.round(clampNumber(band.frequencyHz * 2 ** (direction / 12), 20, 20_000)); },
    gain: (band, direction) => { band.gainDb = clampNumber(band.gainDb + direction * 0.5, -rangeDb, rangeDb); },
    q: (band, direction) => { band.q = clampNumber(band.q * 1.12 ** direction, 0.2, 12); },
  };
  mount(host, model, draw, {
    type: (value) => { model.bands[model.selected].type = value; },
    power: () => { model.bands[model.selected].on = !model.bands[model.selected].on; },
    solo: () => { model.solo = model.solo === model.selected ? -1 : model.selected; },
    remove: () => {
      model.bands.splice(model.selected, 1);
      model.selected = -1;
      model.solo = -1;
    },
    step: (value) => {
      const [field, direction] = value.split(":");
      steps[field](model.bands[model.selected], Number(direction));
    },
  });
}

function mountTable(host, model) {
  const draw = () => {
    const rows = model.bands.map((band, index) => `<tr class="${index === model.selected ? "on" : ""}" data-act="select" data-value="${index}">
        <td><span style="color:${typeColor[band.type]}">${index + 1}</span> ${typeName[band.type]}</td>
        <td>${Math.round(band.frequencyHz)}</td><td>${hasGain(band.type) ? signedDb(band.gainDb) : ""}</td><td>${band.q.toFixed(2)}</td>
      </tr>`);
    return `<table class="band-table"><thead><tr><th>Band</th><th>Hz</th><th>dB</th><th>Q</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
  };
  mount(host, model, draw, { select: (value) => { model.selected = Number(value); } });
}

function mountZoom(host, graph, model, canTurn) {
  const names = [["all", "All"], ["lows", "Lows"], ["mids", "Mids"], ["highs", "Highs"]];
  const draw = () => {
    const pills = names.map(([key, label]) => `<button class="${graph.zoom === key ? "on" : ""}" data-act="zoom" data-value="${key}">${label}</button>`);
    const tall = canTurn ? `<button class="${graph.vertical ? "on" : ""}" data-act="turn" title="Turn the graph so frequency runs down the panel">Tall</button>` : "";
    return `<div class="pills">${pills.join("")}${tall}</div>`;
  };
  mount(host, model, draw, {
    zoom: (value) => { graph.zoom = value; },
    turn: () => { graph.vertical = !graph.vertical; },
  });
}

function mountPreamp(host, model) {
  mount(host, model, () => {
    const preampDb = -maxBoostDb(model);
    return `<div class="preamp"><b>${preampDb.toFixed(1)} dB</b><small>Auto preamp</small></div>`;
  }, {});
}

function mountSheet(frame, model) {
  const sheet = frame.querySelector(".sheet");
  const titles = { library: "Library", table: "Number table" };
  frame.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-sheet]");
    if (opener) {
      const name = opener.dataset.sheet;
      sheet.querySelector(".sheet-title").textContent = titles[name];
      sheet.querySelector(".sheet-library").hidden = name !== "library";
      sheet.querySelector(".sheet-table").hidden = name !== "table";
      sheet.hidden = false;
    }
    if (event.target.closest("[data-close]")) sheet.hidden = true;
  });
  return () => {
    sheet.hidden = true;
    model.changed();
  };
}

function legendHtml(hasLayers) {
  const swatch = (style) => `<i class="swatch" style="${style}"></i>`;
  const dot = (color) => `<i class="swatch" style="width:8px;border-radius:50%;background:${color}"></i>`;
  return `<div class="legend">
      <span>${swatch("height:2px;background:#5b8cff")}EQ curve</span>
      <span>${swatch("background:rgba(91,140,255,0.3)")}Live sound</span>
      <span>${swatch("background:rgba(255,122,144,0.5)")}Louder</span>
      <span>${swatch("background:rgba(79,163,255,0.5)")}Quieter</span>
      <span>${swatch("background:rgba(176,107,255,0.35)")}Selected band</span>
      <span>${swatch("height:0;border-top:2px dashed #b06bff")}Band width (Q)</span>
      <span>${dot(typeColor.PK)}Peak</span>
      <span>${dot(typeColor.LSC)}Shelf</span>
      <span>${dot(typeColor.HP)}Cut</span>
      ${hasLayers ? `<span>${swatch(`height:0;border-top:2px dashed ${layerColor.headphone}`)}Headphone layer</span><span>${swatch(`height:0;border-top:2px dashed ${layerColor.ear}`)}My ear layer</span>` : ""}
    </div>`;
}

const byId = (id) => document.getElementById(id);

for (const host of document.querySelectorAll(".legend-host")) host.innerHTML = legendHtml("layers" in host.dataset);

{
  const model = makeModel(headphoneBands, "AKG N700NC M2");
  const libraryHost = byId("a-library");
  mountHeader(byId("a-head"), model);
  mountProfile(byId("a-profile"), model, () => { libraryHost.hidden = !libraryHost.hidden; });
  mountLibrary(libraryHost, model, () => { libraryHost.hidden = true; });
  const graph = makeGraph(byId("a-graph"), model, { height: 110, showNodes: false, regions: false, interactive: true });
  mountMacros(byId("a-macros"), model, true);
  mountChips(byId("a-chips"), model);
  mountInspector(byId("a-inspector"), model, false);
  byId("a-advanced-toggle").addEventListener("click", (event) => {
    const advanced = byId("a-advanced");
    advanced.hidden = !advanced.hidden;
    byId("a-legend").hidden = advanced.hidden;
    event.target.textContent = advanced.hidden ? "Fine tune every band" : "Back to simple";
    graph.setOptions({ height: advanced.hidden ? 110 : 190, showNodes: !advanced.hidden, regions: !advanced.hidden });
  });
}

{
  const model = makeModel(headphoneBands, "AKG N700NC M2");
  model.selected = 4;
  mountHeader(byId("b-head"), model);
  const graph = makeGraph(byId("b-graph"), model, { height: 200, tallHeight: 420, showNodes: true, regions: true, interactive: true });
  mountZoom(byId("b-zoom"), graph, model, true);
  mountChips(byId("b-chips"), model);
  mountInspector(byId("b-inspector"), model, false);
  mountPreamp(byId("b-preamp"), model);
  mountTable(byId("b-table"), model);
  const closeSheet = mountSheet(byId("b-sheet").parentElement, model);
  mountLibrary(byId("b-library"), model, closeSheet);
}

{
  const model = makeModel(headphoneBands, "AKG N700NC M2");
  const tabs = byId("c-tabs");
  const frame = tabs.parentElement;
  const showTab = (name) => {
    for (const button of tabs.children) button.classList.toggle("on", button.dataset.tab === name);
    for (const pane of frame.querySelectorAll("[data-pane]")) pane.hidden = pane.dataset.pane !== name;
    model.changed();
  };
  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (button) showTab(button.dataset.tab);
  });
  mountHeader(byId("c-head"), model);
  mountProfile(byId("c-profile"), model, () => showTab("library"));
  makeGraph(byId("c-listen-graph"), model, { height: 210, tallHeight: 420, showNodes: false, regions: true, interactive: false });
  mountMacros(byId("c-macros"), model, "preamp");
  const graph = makeGraph(byId("c-graph"), model, { height: 210, tallHeight: 420, showNodes: true, regions: true, interactive: true });
  mountZoom(byId("c-zoom"), graph, model, true);
  mountChips(byId("c-chips"), model);
  mountInspector(byId("c-inspector"), model, false);
  mountTable(byId("c-table"), model);
  mountLibrary(byId("c-library"), model, () => showTab("listen"));
}

{
  const model = makeModel(headphoneBands, "AKG N700NC M2");
  model.selected = 1;
  mountHeader(byId("d-head"), model);
  makeGraph(byId("d-graph"), model, { vertical: true, tallHeight: 440, showNodes: true, regions: true, interactive: true });
  mountInspector(byId("d-inspector"), model, true);
  mountPreamp(byId("d-preamp"), model);
  mountTable(byId("d-table"), model);
  const closeSheet = mountSheet(byId("d-sheet").parentElement, model);
  mountLibrary(byId("d-library"), model, closeSheet);
}

{
  const model = makeModel(headphoneBands, "AKG N700NC M2");
  model.selected = 4;
  mountHeader(byId("w-head"), model);
  mountProfile(byId("w-profile"), model, () => byId("w-library").querySelector("input").focus());
  mountMacros(byId("w-macros"), model, true);
  const graph = makeGraph(byId("w-graph"), model, { height: 280, tallHeight: 520, showNodes: true, regions: true, interactive: true });
  mountZoom(byId("w-zoom"), graph, model, false);
  mountChips(byId("w-chips"), model);
  mountTable(byId("w-table"), model);
  mountInspector(byId("w-inspector"), model, false);
  mountLibrary(byId("w-library"), model, null);
}

function mountTabs(tabsId, model) {
  const tabs = byId(tabsId);
  const frame = tabs.parentElement;
  const showTab = (name) => {
    for (const button of tabs.children) button.classList.toggle("on", button.dataset.tab === name);
    for (const pane of frame.querySelectorAll("[data-pane]")) pane.hidden = pane.dataset.pane !== name;
    model.changed();
  };
  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (button) showTab(button.dataset.tab);
  });

  return showTab;
}

function mountLayers(host, model, onChange) {
  const draw = () => {
    const rows = Object.entries(model.layers).map(([key, layer]) => `<div class="layer-row ${layer.on ? "" : "off"}">
        <button class="switch ${layer.on ? "" : "off"}" data-act="toggle" data-value="${key}" title="Turn this layer on or off"></button>
        <div class="grow"><small><i class="layer-mark" style="border-color:${layerColor[key]}"></i>${layer.label} · ${layer.source}</small><b>${layer.name}</b></div>
        <button data-act="change" data-value="${key}">Change</button>
        ${key === "ear" ? `<button data-act="remove" title="Take the ear layer off">×</button>` : ""}
      </div>`);
    const add = model.layers.ear ? "" : `<button class="wide-button" data-act="addEar">Add your ear tuning on top</button>`;
    return rows.join("") + add;
  };
  mount(host, model, draw, {
    toggle: (key) => { model.layers[key].on = !model.layers[key].on; },
    change: (key) => onChange(key),
    addEar: () => onChange("ear"),
    remove: () => {
      delete model.layers.ear;
      model.bands = model.bands.filter((band) => band.layer !== "ear");
      model.selected = -1;
    },
  });
}

{
  const model = makeModel(headphoneBands, "AKG N700NC M2");
  const showTab = mountTabs("e-tabs", model);
  mountHeader(byId("e-head"), model);
  mountProfile(byId("e-sound"), model, () => {});
  byId("e-text").value = earText;
  makeGraph(byId("e-graph"), model, { height: 210, tallHeight: 420, showNodes: true, regions: true, interactive: true });
  mountChips(byId("e-chips"), model);
  mountInspector(byId("e-inspector"), model, false);
  const merge = (isAdding) => {
    const bands = parseAutoEqText(byId("e-text").value);
    model.bands = isAdding ? [...model.bands, ...bands] : bands;
    model.profile = isAdding ? "AKG N700NC M2 + Ear test" : "Ear test";
    model.selected = -1;
    showTab("tune");
  };
  byId("e-add").addEventListener("click", () => merge(true));
  byId("e-replace").addEventListener("click", () => merge(false));
}

{
  const model = makeModel(headphoneBands.map((band) => ({ ...band, layer: "headphone" })), "AKG N700NC M2");
  model.bands.push(...parseAutoEqText(earText, "ear"));
  model.layers = {
    headphone: { label: "Headphone", source: "AutoEQ", name: "AKG N700NC M2", on: true },
    ear: { label: "My ear", source: "eqbyear", name: "Ear test, 12 Oct", on: true },
  };
  let target = "ear";
  const showTab = mountTabs("f-tabs", model);
  const drawTarget = () => {
    const choices = [["headphone", "Headphone"], ["ear", "My ear"]].map(([key, label]) => `<button class="${key === target ? "on" : ""}" data-target="${key}">${label}</button>`);
    byId("f-target").innerHTML = `<span>Put into</span>${choices.join("")}`;
  };
  byId("f-target").addEventListener("click", (event) => {
    const button = event.target.closest("[data-target]");
    if (!button) return;
    target = button.dataset.target;
    drawTarget();
  });
  mountHeader(byId("f-head"), model);
  mountLayers(byId("f-layers"), model, (key) => {
    target = key;
    drawTarget();
    showTab("library");
  });
  makeGraph(byId("f-listen-graph"), model, { height: 210, tallHeight: 420, showNodes: false, regions: true, interactive: false, layerCurves: true });
  mountMacros(byId("f-macros"), model, "preamp");
  const graph = makeGraph(byId("f-graph"), model, { height: 210, tallHeight: 420, showNodes: true, regions: true, interactive: true, layerCurves: true });
  mountZoom(byId("f-zoom"), graph, model, true);
  mountChips(byId("f-chips"), model);
  mountInspector(byId("f-inspector"), model, false);
  byId("f-text").value = earText;
  drawTarget();
  byId("f-apply").addEventListener("click", () => {
    const bands = parseAutoEqText(byId("f-text").value, target);
    const order = { headphone: 0, ear: 1 };
    model.bands = [...model.bands.filter((band) => band.layer !== target), ...bands].sort((first, second) => order[first.layer] - order[second.layer]);
    const name = target === "ear" ? "Pasted ear tuning" : "Pasted headphone";
    model.layers[target] = { label: target === "ear" ? "My ear" : "Headphone", source: "Pasted", name, on: true };
    model.selected = -1;
    showTab("listen");
  });
}

setInterval(() => {
  tickCount += 1;
  for (const graph of graphs) if (!graph.drag) graph.render();
}, 200);

window.addEventListener("resize", () => graphs.forEach((graph) => graph.render()));

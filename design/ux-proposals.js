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

const typeColor = { PK: "#b06bff", LSC: "#38bdf8", HSC: "#38bdf8", HP: "#ff9f43", LP: "#ff9f43" };
const typeName = { PK: "Peak", LSC: "Low shelf", HSC: "High shelf", HP: "Low cut", LP: "High cut" };
const zooms = { all: [20, 20_000], lows: [20, 400], mids: [200, 5000], highs: [2000, 20_000] };
const layerColor = { headphone: "#a9b8ff", ear: "#ffd166", taste: "#ff8fb1" };
const earText = "Preamp: 0.0 dB\nFilter 1: ON PK Fc 94 Hz Gain -5.0 dB Q 1.60\nFilter 2: ON PK Fc 7732 Hz Gain -3.0 dB Q 2.85";
const tasteText = "Preamp: 0.0 dB\nFilter 1: ON LSC Fc 60 Hz Gain 2.0 dB Q 0.70\nFilter 2: ON PK Fc 3000 Hz Gain -1.5 dB Q 1.40";
const layerNames = { headphone: "Headphone", ear: "My ear", taste: "Taste" };
const pastedNames = { headphone: "Pasted headphone", ear: "Pasted ear tuning", taste: "Pasted taste" };

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

// Named presets the mocks apply, so a Set and a Library pick share one source.
const libraryBands = (name) => (library.find((entry) => entry.name === name) || { bands: [] }).bands;
const presetBands = {
  "AKG N700NC M2": headphoneBands,
  "Sennheiser HD 600": libraryBands("Sennheiser HD 600"),
  "Sony WH-1000XM4": libraryBands("Sony WH-1000XM4"),
  "Podcast voice": libraryBands("Podcast voice"),
  "Clear vocals": libraryBands("Clear vocals"),
  Flat: [],
  "Ear test, 12 Oct": parseAutoEqText(earText, "ear"),
  "Ear test, 3 Sep": parseAutoEqText(earText, "ear"),
  "Warm and smooth": parseAutoEqText(tasteText, "taste"),
};

const sectionCaptions = {
  headphone: "Makes your headphone sound neutral. Find it in AutoEQ below, then save it as your own preset.",
  ear: "Tunes the sound to your own hearing, on top of the headphone. Measure it with the EQByEar test, then paste and save it.",
  taste: "Your own flavour, on top of your ear. Add bands in Tune, or paste AutoEQ text here, then save it.",
};

const graphs = [];
let tickCount = 0;

// The record draws its curve in the brand accent, so the picker re-themes it too.
let accentColor = "#d4ff3f";


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
    BP: () => [alpha, 0, -alpha, 1 + alpha, -2 * cosine, 1 - alpha],
    NO: () => [1, -2 * cosine, 1, 1 + alpha, -2 * cosine, 1 - alpha],
    AP: () => [1 - alpha, -2 * cosine, 1 + alpha, 1 + alpha, -2 * cosine, 1 - alpha],
  };
  formulas.LSF = formulas.LSC;
  formulas.HSF = formulas.HSC;

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
  if (vocals) list.push({ type: "PK", frequencyHz: 1500, gainDb: vocals, q: 0.7 });
  if (treble) list.push({ type: "HSC", frequencyHz: 3500, gainDb: treble, q: 0.7 });

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
      const layerRing = band.layer && band.layer !== "headphone" ? `<circle cx="${point.x}" cy="${point.y}" r="9" fill="none" stroke="${layerColor[band.layer]}" stroke-width="1.5"/>` : "";
      return `${layerRing}${ring}<circle cx="${point.x}" cy="${point.y}" r="7" fill="${fill}" stroke="${typeColor[band.type]}" stroke-width="1.5"/>`
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
    const curveColor = model.bypass || !model.enabled ? "rgba(255,255,255,0.35)" : accentColor;
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
  const rows = [["bass", "Bass", "Below 120 Hz"], ["vocals", "Vocals", "Around 1.5 kHz"], ["treble", "Treble", "Above 3.5 kHz"]];
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
      <span>${swatch("height:2px;background:var(--accent)")}EQ curve</span>
      <span>${swatch("background:rgba(91,140,255,0.3)")}Live sound</span>
      <span>${swatch("background:rgba(255,122,144,0.5)")}Louder</span>
      <span>${swatch("background:rgba(79,163,255,0.5)")}Quieter</span>
      <span>${swatch("background:rgba(176,107,255,0.35)")}Selected band</span>
      <span>${swatch("height:0;border-top:2px dashed #b06bff")}Band width (Q)</span>
      <span>${dot(typeColor.PK)}Peak</span>
      <span>${dot(typeColor.LSC)}Shelf</span>
      <span>${dot(typeColor.HP)}Cut</span>
      ${hasLayers ? `<span>${swatch(`height:0;border-top:2px dashed ${layerColor.headphone}`)}Headphone layer</span><span>${swatch(`height:0;border-top:2px dashed ${layerColor.ear}`)}My ear layer</span><span>${swatch(`height:0;border-top:2px dashed ${layerColor.taste}`)}Taste layer</span>` : ""}
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
  const model = makeModel(headphoneBands.map((band) => ({ ...band, layer: "headphone" })), "AKG N700NC M2");
  model.bands.push(...parseAutoEqText(earText, "ear"), ...parseAutoEqText(tasteText, "taste"));
  model.layers = {
    headphone: { label: "Headphone", source: "AutoEQ", name: "AKG N700NC M2", on: true },
    ear: { label: "My ear", source: "EQByEar", name: "Ear test, 12 Oct", on: true },
    taste: { label: "Taste", source: "Saved", name: "Warm and smooth", on: true },
  };
  model.presets = {
    headphone: ["AKG N700NC M2", "Sennheiser HD 600", "Flat"],
    ear: ["Ear test, 12 Oct", "Ear test, 3 Sep"],
    taste: ["Warm and smooth", "Podcast voice"],
  };
  model.libraryRole = "headphone";
  const showTab = mountTabs("c-tabs", model);
  mountHeader(byId("c-head"), model);
  mountLayers(byId("c-layers"), model, (key) => {
    model.libraryRole = key;
    model.changed();
    showTab("library");
  });
  makeGraph(byId("c-listen-graph"), model, { height: 210, tallHeight: 420, showNodes: false, regions: true, interactive: false, layerCurves: true });
  mountSliders(byId("c-sliders"), model);
  const graph = makeGraph(byId("c-graph"), model, { height: 210, tallHeight: 420, showNodes: true, regions: true, interactive: true, layerCurves: true });
  mountZoom(byId("c-zoom"), graph, model, true);
  mountChips(byId("c-chips"), model);
  mountInspector(byId("c-inspector"), model, false);
  mountTable(byId("c-table"), model);
  mountLibrarySections(byId("c-library"), model);
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
        ${key === "headphone" ? "" : `<button data-act="remove" data-value="${key}" title="Take the ${key} layer off">×</button>`}
      </div>`);
    const missing = ["ear", "taste"].filter((key) => !model.layers[key]);
    const words = { ear: ["Add ear tuning", "Add your ear tuning on top"], taste: ["Add taste", "Add your taste on top"] };
    const buttons = missing.map((key) => `<button data-act="add" data-value="${key}">${words[key][missing.length > 1 ? 0 : 1]}</button>`);
    const add = missing.length > 0 ? `<div class="add-layers">${buttons.join("")}</div>` : "";
    return rows.join("") + add;
  };
  mount(host, model, draw, {
    toggle: (key) => { model.layers[key].on = !model.layers[key].on; },
    change: (key) => onChange(key),
    add: (key) => onChange(key),
    remove: (key) => {
      delete model.layers[key];
      model.bands = model.bands.filter((band) => band.layer !== key);
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
  model.bands.push(...parseAutoEqText(earText, "ear"), ...parseAutoEqText(tasteText, "taste"));
  model.layers = {
    headphone: { label: "Headphone", source: "AutoEQ", name: "AKG N700NC M2", on: true },
    ear: { label: "My ear", source: "EQByEar", name: "Ear test, 12 Oct", on: true },
    taste: { label: "Taste", source: "Saved", name: "Warm and smooth", on: true },
  };
  let target = "ear";
  const showTab = mountTabs("f-tabs", model);
  const drawTarget = () => {
    const choices = Object.entries(layerNames).map(([key, label]) => `<button class="${key === target ? "on" : ""}" data-target="${key}">${label}</button>`);
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
    const order = { headphone: 0, ear: 1, taste: 2 };
    model.bands = [...model.bands.filter((band) => band.layer !== target), ...bands].sort((first, second) => order[first.layer] - order[second.layer]);
    model.layers = Object.fromEntries(Object.keys(order).filter((key) => key === target || model.layers[key]).map((key) => [key, key === target ? { label: layerNames[key], source: "Pasted", name: pastedNames[key], on: true } : model.layers[key]]));
    model.selected = -1;
    showTab("listen");
  });
}

// The sliders card the panel ships: Bass, Vocals and Treble, the preamp row and Level match.
function mountSliders(host, model) {
  const rows = [["bass", "Bass", "Below 120 Hz"], ["vocals", "Vocals", "Around 1.5 kHz"], ["treble", "Treble", "Above 3.5 kHz"]];
  const sliders = rows.map(([key, label, hint]) => `<label class="macro">
      <span>${label}<small>${hint}</small></span>
      <input type="range" min="-6" max="6" step="0.5" value="${model.macros[key]}" data-key="${key}" />
      <output>${signedDb(model.macros[key])} dB</output>
    </label>`);

  host.innerHTML = sliders.join("") + `<div class="preamp-row">
      <span>Preamp<small>Auto</small></span>
      <input type="range" min="-24" max="12" step="0.1" value="0" />
      <output>0.0 dB</output>
      <button class="on" title="Set the preamp from the largest boost of the total curve">Auto</button>
    </div><div class="safety"><span>Level match<small>Keep the preamp in A/B testing</small></span><button class="switch" title="Level match"></button></div>`;

  const preamp = host.querySelector(".preamp-row input");
  const preampOutput = preamp.nextElementSibling;
  const sync = () => {
    for (const input of host.querySelectorAll("input[data-key]")) {
      input.value = model.macros[input.dataset.key];
      input.nextElementSibling.textContent = `${signedDb(model.macros[input.dataset.key])} dB`;
    }
    const preampDb = 0 - maxBoostDb(model);
    preamp.value = preampDb;
    preampOutput.textContent = `${signedDb(preampDb)} dB`;
  };
  host.addEventListener("input", (event) => {
    const key = event.target.dataset.key;
    if (!key) return;
    model.macros[key] = Number(event.target.value);
    model.changed();
  });
  model.listeners.push(sync);
  sync();
}

// The Library the panel ships: one tab per layer, each with its own presets and actions.
function mountLibrarySections(host, model) {
  const order = ["headphone", "ear", "taste"];
  const emptyNames = { headphone: "Flat", ear: "No ear tuning", taste: "No taste" };
  const draw = () => {
    const role = model.libraryRole;
    const layer = model.layers[role];
    const tabs = order.map((key) => `<button data-role="${key}" class="${key === role ? "on" : ""}">${layerNames[key]}</button>`).join("");
    const saved = (model.presets[role] || []).map((name) => `<button class="item ${layer && layer.name === name ? "on" : ""}" data-act="pick" data-value="${name}"><span>${name}</span><small>${(presetBands[name] || []).length} bands</small></button>`).join("");
    const search = role === "headphone"
      ? `<input type="search" class="search-row" placeholder="Search AutoEQ or your presets, for example HD 600" />${library.filter((entry) => entry.section === "AutoEQ headphones").map((entry) => `<button class="item ${layer && layer.name === entry.name ? "on" : ""}" data-act="pick" data-value="${entry.name}"><span>${entry.name}</span><small>${entry.bands.length} bands</small></button>`).join("")}`
      : "";
    const caption = layer ? `${layer.source}, not saved yet` : "Nothing yet";

    return `<div class="tabs library-tabs">${tabs}</div>
      <div class="section-head"><span class="step">${order.indexOf(role) + 1}</span><div class="grow"><b>${layerNames[role]}</b><small>${sectionCaptions[role]}</small></div></div>
      <div class="current"><div class="grow"><small class="caption">${caption}</small><b>${layer ? layer.name : emptyNames[role]}</b></div><button>Save</button><button title="Keep this as a new preset under another name">Save as new</button></div>
      <div class="library-actions"><button>Import</button><button>Paste</button><button>Export</button></div>
      ${search}
      <div class="results">${saved}</div>`;
  };
  host.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-role]");
    if (tab) {
      model.libraryRole = tab.dataset.role;
      model.changed();
      return;
    }
    const pick = event.target.closest("button[data-act='pick']");
    if (!pick) return;
    const bands = presetBands[pick.dataset.value];
    if (!bands) return;
    const role = model.libraryRole;
    model.layers[role] = { label: layerNames[role], source: role === "headphone" ? "AutoEQ" : "Saved", name: pick.dataset.value, on: true };
    model.bands = [...model.bands.filter((band) => band.layer !== role), ...bands.map((band) => ({ ...band, layer: role }))].sort((first, second) => order.indexOf(first.layer) - order.indexOf(second.layer));
    model.selected = -1;
    model.changed();
  });
  const update = () => {
    host.innerHTML = draw();
  };
  model.listeners.push(update);
  update();
}

// Sets: one headphone preset, one ear preset and one taste preset, plus the sliders.
function describeSet(set) {
  return ["headphone", "ear", "taste"].map((role) => set.parts[role] || (role === "headphone" ? "Flat" : "off")).join(" · ");
}

function applySet(model, name) {
  const set = model.sets.find((entry) => entry.name === name);
  if (!set) return;

  const bands = [];
  model.layers ??= {};

  for (const role of ["headphone", "ear", "taste"]) {
    const presetName = set.parts[role];

    if (presetName) {
      model.layers[role] = { label: layerNames[role], source: "Saved", name: presetName, on: true };
      bands.push(...(presetBands[presetName] || []).map((band) => ({ ...band, layer: role })));
    } else if (role === "headphone") {
      model.layers[role] = { label: "Headphone", source: "Starter sound", name: "Flat", on: true };
    } else {
      delete model.layers[role];
    }
  }

  model.bands = bands;
  model.macros = { ...set.sliders };
  model.currentSet = name;
  model.selected = -1;
  model.changed();
}

function mountSetPicker(host, model) {
  const draw = () => {
    const options = model.sets.map((set) => `<option value="${set.name}" ${set.name === model.currentSet ? "selected" : ""}>${set.name}</option>`);
    host.innerHTML = `<div class="set-picker">
        <label class="grow"><small class="caption">Set</small><select>${options.join("")}</select></label>
        <button title="Save the three layers and the sliders as one Set">Save as Set</button>
      </div>`;
  };
  host.addEventListener("change", (event) => applySet(model, event.target.value));
  const update = () => {
    draw();
  };
  model.listeners.push(update);
  draw();
}

function mountSetsSection(host, model) {
  const draw = () => {
    const names = [...model.sets].sort((first, second) => first.name.localeCompare(second.name));
    const lines = names.map((set) => `<div class="set-line">
        <button class="item ${set.name === model.currentSet ? "on" : ""}" data-act="apply" data-value="${set.name}"><span>${set.name}</span><small>${describeSet(set)}</small></button>
        <button data-act="remove" data-value="${set.name}" title="Delete this Set">×</button>
      </div>`);
    const caption = model.currentSet ? "Your Set" : "Nothing yet";

    return `<div class="section-head"><span class="step">4</span><div class="grow"><b>Sets</b><small>Your headphone, your ear and your taste in one press. A Set points at the presets, so editing one updates every Set that uses it.</small></div></div>
      <div class="current"><div class="grow"><small class="caption">${caption}</small><b>${model.currentSet || "Save your first Set"}</b></div><button data-act="save" title="Save the three layers and the sliders as one Set">Save as Set</button></div>
      ${lines.join("")}
      <p class="hint">Save as Set needs each layer with bands saved as a preset first. When a layer still has unsaved bands, an alert names it and stops.</p>`;
  };
  mount(host, model, draw, {
    apply: (name) => applySet(model, name),
    remove: (name) => {
      model.sets = model.sets.filter((set) => set.name !== name);
    },
    save: () => {},
  });
}

function mountMenuMock(host, model) {
  const draw = () => {
    const names = [...model.sets].sort((first, second) => first.name.localeCompare(second.name));
    const items = names.map((set) => `<div class="menu-item ${set.name === model.currentSet ? "on" : ""}"><span>${set.name}</span>${set.name === model.currentSet ? "<b>✓</b>" : ""}</div>`);

    return `<div class="menu-mock">
        <div class="menu-item"><span>Wide panel</span></div>
        <div class="menu-item"><span>Restart engine</span></div>
        <div class="menu-item"><span>Reload panel</span></div>
        <hr />
        <div class="menu-item"><span>Sets</span><b>▸</b></div>
        <div class="menu-sub">${items.join("")}</div>
        <hr />
        <div class="menu-item"><span>Quit goui</span></div>
      </div>`;
  };
  const update = () => {
    host.innerHTML = draw();
  };
  model.listeners.push(update);
  update();
}

{
  const model = makeModel([], "Flat");
  model.sets = [
    { name: "HD 600 home", parts: { headphone: "Sennheiser HD 600", ear: "Ear test, 12 Oct", taste: "Warm and smooth" }, sliders: { bass: 1.5, vocals: 0, treble: -1 } },
    { name: "AirPods commute", parts: { headphone: "Sony WH-1000XM4", ear: null, taste: "Podcast voice" }, sliders: { bass: 2, vocals: 1, treble: 0 } },
    { name: "Flat and quick", parts: { headphone: "Flat", ear: null, taste: "Clear vocals" }, sliders: { bass: 0, vocals: 0, treble: 0 } },
  ];
  model.currentSet = "HD 600 home";
  applySet(model, "HD 600 home");

  const showTab = mountTabs("g-tabs", model);
  mountHeader(byId("g-head"), model);
  mountSetPicker(byId("g-sets"), model);
  mountMenuMock(byId("g-menu"), model);
  mountLayers(byId("g-layers"), model, () => showTab("library"));
  makeGraph(byId("g-listen-graph"), model, { height: 180, tallHeight: 380, showNodes: false, regions: true, interactive: false, layerCurves: true });
  mountSliders(byId("g-sliders"), model);
  const graph = makeGraph(byId("g-graph"), model, { height: 200, tallHeight: 420, showNodes: true, regions: true, interactive: true, layerCurves: true });
  mountZoom(byId("g-zoom"), graph, model, true);
  mountChips(byId("g-chips"), model);
  mountInspector(byId("g-inspector"), model, false);
  mountSetsSection(byId("g-library"), model);

  mountHeader(byId("gw-head"), model);
  mountLayers(byId("gw-layers"), model, () => {});
  mountSliders(byId("gw-sliders"), model);
  makeGraph(byId("gw-graph"), model, { height: 250, tallHeight: 500, showNodes: true, regions: true, interactive: true, layerCurves: true });
  mountChips(byId("gw-chips"), model);
  mountSetsSection(byId("gw-library"), model);
}

// The redesign starts here. One token set, twelve primitives, and every goui screen put together from them.

const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (character) => entities[character]);
}

function classList(base, flags) {
  const names = [base];

  for (const [name, isSet] of Object.entries(flags)) if (isSet) names.push(name);

  return names.join(" ");
}

function actAttributes({ act, value, title, extra }) {
  const parts = [""];

  if (act) parts.push(`data-act="${act}"`);
  if (value !== undefined && value !== null) parts.push(`data-value="${escapeHtml(value)}"`);
  if (title) parts.push(`title="${escapeHtml(title)}"`);
  if (extra) parts.push(extra);

  return parts.join(" ");
}

function iconHtml(name) {
  return `<svg class="ui-icon" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
}

// The twelve primitives. Each returns markup, and every screen below is only these, put together.
const ui = {
  button({ label = "", act, value, title, variant = "plain", size, icon, href, isOn, isHeld, isDisabled, isWide, tone, extra }) {
    const className = classList(`ui-button ui-button--${variant}`, {
      [`ui-button--${size}`]: Boolean(size),
      "ui-button--wide": isWide,
      "ui-button--icon": Boolean(icon) && label === "",
      "is-on": isOn,
      "is-held": isHeld,
      [`tone-${tone}`]: Boolean(tone),
    });
    const content = `${icon ? iconHtml(icon) : ""}${label === "" ? "" : `<span>${escapeHtml(label)}</span>`}`;

    if (href) return `<a class="${className}" href="${href}" target="_blank" rel="noopener"${actAttributes({ title })}>${content}</a>`;

    const pressed = isOn === undefined ? "" : ` aria-pressed="${isOn}"`;
    const name = icon && label === "" && title ? ` aria-label="${escapeHtml(title)}"` : "";

    return `<button type="button" class="${className}"${actAttributes({ act, value, title, extra })}${pressed}${name}${isDisabled ? " disabled" : ""}>${content}</button>`;
  },

  switch({ isOn, act, value, title, isDisabled }) {
    return `<button type="button" class="ui-switch" role="switch" aria-checked="${Boolean(isOn)}"${actAttributes({ act, value, title })}${title ? ` aria-label="${escapeHtml(title)}"` : ""}${isDisabled ? " disabled" : ""}><span class="ui-switch__knob"></span></button>`;
  },

  listRow({ name = "", detail, lead = "", badge = "", cells, act, value, title, variant, isSelected, isMuted, isHead, trail = "" }) {
    const className = classList("ui-list-row", { [`ui-list-row--${variant}`]: Boolean(variant), "is-selected": isSelected, "is-muted": isMuted, "is-head": isHead });
    const detailHtml = detail ? `<span class="ui-list-row__detail">${escapeHtml(detail)}</span>` : "";
    const text = cells
      ? cells.map((cell) => `<span class="ui-list-row__cell">${cell}</span>`).join("")
      : `<span class="ui-list-row__text"><span class="ui-list-row__name"><span>${escapeHtml(name)}</span>${badge}</span>${detailHtml}</span>`;
    const tag = act ? "button" : "div";
    const current = isSelected && act ? ' aria-current="true"' : "";
    const main = `<${tag} ${act ? 'type="button" ' : ""}class="ui-list-row__main"${actAttributes({ act, value, title })}${current}>${lead}${text}</${tag}>`;

    return `<div class="${className}">${main}${trail ? `<span class="ui-list-row__trail">${trail}</span>` : ""}</div>`;
  },

  stackRow({ tone, lead = "", caption = "", name = "", extra = "", trail = "", isOff, isEmpty }) {
    const className = classList("ui-stack-row", { [`tone-${tone}`]: Boolean(tone), "has-bar": Boolean(tone), "is-off": isOff, "is-empty": isEmpty });
    const leadHtml = lead ? `<span class="ui-stack-row__lead">${lead}</span>` : "";
    const trailHtml = trail ? `<span class="ui-stack-row__trail">${trail}</span>` : "";

    return `<div class="${className}">${leadHtml}<span class="ui-stack-row__body"><span class="ui-stack-row__caption">${caption}</span><span class="ui-stack-row__name">${name}</span>${extra}</span>${trailHtml}</div>`;
  },

  sectionHeader({ variant = "eyebrow", label, caption, step, tone, count, trail = "" }) {
    const toneClass = tone ? ` tone-${tone}` : "";

    if (variant === "eyebrow") {
      const counter = count === undefined ? "" : `<span class="ui-section-header__count">${escapeHtml(count)}</span>`;
      return `<div class="ui-section-header ui-section-header--eyebrow${toneClass}"><span class="ui-section-header__label">${escapeHtml(label)}</span>${counter}<span class="ui-section-header__rule"></span>${trail}</div>`;
    }

    const mark = step === undefined ? "" : ui.badge({ kind: "step", label: step, tone });
    const captionHtml = caption ? `<span class="ui-section-header__caption">${escapeHtml(caption)}</span>` : "";

    return `<div class="ui-section-header ui-section-header--${variant}${toneClass}">${mark}<span class="ui-section-header__text"><span class="ui-section-header__title">${escapeHtml(label)}</span>${captionHtml}</span>${trail}</div>`;
  },

  tabs({ items, current, act, size = "large" }) {
    const buttons = items.map(([key, label]) => {
      const isCurrent = key === current;
      return `<button type="button" role="tab" aria-selected="${isCurrent}" class="ui-tabs__item${isCurrent ? " is-current" : ""}" data-act="${act}" data-value="${key}">${escapeHtml(label)}</button>`;
    });

    return `<div class="ui-tabs ui-tabs--${size}" role="tablist">${buttons.join("")}</div>`;
  },

  segmented({ items, current, act, variant = "pill", title }) {
    const buttons = items.map(([key, label]) => {
      const isCurrent = key === current;
      return `<button type="button" role="radio" aria-checked="${isCurrent}" class="ui-segmented__item${isCurrent ? " is-current" : ""}" data-act="${act}" data-value="${key}">${escapeHtml(label)}</button>`;
    });

    return `<div class="ui-segmented ui-segmented--${variant}" role="radiogroup"${title ? ` aria-label="${escapeHtml(title)}"` : ""}>${buttons.join("")}</div>`;
  },

  sliderRow({ label, hint, amount, min, max, step, act, key, trail = "", title }) {
    const share = (number) => ((clampNumber(number, min, max) - min) / (max - min)) * 100;
    const fill = readSliderFill(share(0), share(amount));
    const trailHtml = trail ? `<span class="ui-slider-row__trail">${trail}</span>` : "";

    return `<div class="ui-slider-row${trail ? " ui-slider-row--trail" : ""}"><span class="ui-slider-row__label"><span>${escapeHtml(label)}</span><small>${escapeHtml(hint)}</small></span><input type="range" class="ui-slider-row__range" min="${min}" max="${max}" step="${step}" value="${amount}" style="${fill}" aria-label="${escapeHtml(label)}"${actAttributes({ act, value: key, title })} /><output class="ui-slider-row__value">${signedDb(amount)} dB</output>${trailHtml}</div>`;
  },

  chip({ label, number, tone, act, value, title, variant = "band", isOn, isMuted, icon }) {
    const className = classList(`ui-chip ui-chip--${variant}`, { "is-on": isOn, "is-muted": isMuted, [`tone-${tone}`]: Boolean(tone) });
    const mark = number === undefined ? "" : `<i class="ui-chip__mark">${number}</i>`;
    const glyph = icon ? iconHtml(icon) : "";
    const tag = act ? "button" : "span";
    const pressed = isOn !== undefined && act ? ` aria-pressed="${isOn}"` : "";

    return `<${tag} ${act ? 'type="button" ' : ""}class="${className}"${actAttributes({ act, value, title })}${pressed}>${mark}${glyph}<span>${escapeHtml(label)}</span></${tag}>`;
  },

  field({ kind = "text", amount = "", placeholder = "", act, key, label, options = [], unit = "", steps, stepTitles = [], title, rows = 4, isReadOnly }) {
    const prefix = label ? `<span class="ui-field__prefix">${escapeHtml(label)}</span>` : "";

    if (kind === "area") {
      return `<textarea class="ui-field ui-field--area" spellcheck="false" rows="${rows}" placeholder="${escapeHtml(placeholder)}"${actAttributes({ act, value: key, title })}${isReadOnly ? " readonly" : ""}>${escapeHtml(amount)}</textarea>`;
    }

    if (kind === "select") {
      const choices = options.map(([optionValue, optionLabel, isPlaceholder]) => `<option value="${escapeHtml(optionValue)}"${optionValue === amount ? " selected" : ""}${isPlaceholder ? " disabled" : ""}>${escapeHtml(optionLabel)}</option>`);
      return `<label class="ui-field ui-field--select">${prefix}<select class="ui-field__control"${actAttributes({ act, value: key, title })}>${choices.join("")}</select>${iconHtml("chevron")}</label>`;
    }

    if (kind === "stepper") {
      const minus = ui.button({ variant: "quiet", icon: "minus", act: steps, value: `${key}:-1`, title: stepTitles[0] });
      const plus = ui.button({ variant: "quiet", icon: "plus", act: steps, value: `${key}:1`, title: stepTitles[1] });
      return `<div class="ui-field ui-field--stepper">${minus}<label class="ui-field__middle"><input class="ui-field__control" inputmode="decimal" value="${escapeHtml(amount)}" aria-label="${escapeHtml(unit)}"${actAttributes({ act, value: key })} /><small>${escapeHtml(unit)}</small></label>${plus}</div>`;
    }

    const icon = kind === "search" ? iconHtml("search") : "";
    const type = kind === "search" ? "search" : "text";
    const isLocked = kind === "code" || isReadOnly;

    return `<label class="ui-field ui-field--${kind}">${icon}${prefix}<input class="ui-field__control" type="${type}" value="${escapeHtml(amount)}" placeholder="${escapeHtml(placeholder)}" spellcheck="false"${actAttributes({ act, value: key, title })}${isLocked ? " readonly" : ""} /></label>`;
  },

  expander({ variant = "drawer", isOpen, body, summary, act, key, count }) {
    if (variant === "drawer") return isOpen ? `<div class="ui-expander ui-expander--drawer">${body}</div>` : "";

    const counter = count === undefined ? "" : `<span class="ui-expander__count">${escapeHtml(count)}</span>`;
    const bodyHtml = isOpen ? `<div class="ui-expander__body">${body}</div>` : "";

    return `<div class="ui-expander ui-expander--disclosure${isOpen ? " is-open" : ""}"><button type="button" class="ui-expander__summary" aria-expanded="${Boolean(isOpen)}"${actAttributes({ act, value: key })}>${iconHtml("chevron")}<span>${escapeHtml(summary)}</span>${counter}</button>${bodyHtml}</div>`;
  },

  badge({ label = "", tone = "muted", kind = "pill", key, title }) {
    const className = `ui-badge ui-badge--${kind} tone-${tone}${key ? ` ui-badge--key-${key}` : ""}`;
    const mark = kind === "dot" || kind === "key" ? '<i class="ui-badge__mark"></i>' : "";
    const text = label === "" ? "" : `<span>${escapeHtml(label)}</span>`;

    return `<span class="${className}"${title ? ` title="${escapeHtml(title)}"` : ""}>${mark}${text}</span>`;
  },
};

// A dB slider fills from 0 dB to its value, so a cut and a boost read apart at a glance.
function readSliderFill(zeroShare, valueShare) {
  return `--low:${Math.min(zeroShare, valueShare).toFixed(2)}%;--high:${Math.max(zeroShare, valueShare).toFixed(2)}%`;
}

const roles = ["headphone", "ear", "taste"];
const roleNouns = { headphone: "headphone", ear: "ear", taste: "taste" };
const emptyNames = { headphone: "Flat", ear: "No ear tuning", taste: "No taste" };
const sliderSpecs = [
  { key: "bass", label: "Bass", hint: "Below 120 Hz", type: "LSC", frequencyHz: 105, q: 0.71 },
  { key: "vocals", label: "Vocals", hint: "Around 1.5 kHz", type: "PK", frequencyHz: 1500, q: 0.7 },
  { key: "treble", label: "Treble", hint: "Above 3.5 kHz", type: "HSC", frequencyHz: 3500, q: 0.71 },
];
const sliderRangeDb = [-6, 6];
const preampRangeDb = [-24, 12];
const bandGainRangeDb = [-20, 20];
const bandQRange = [0.1, 18];
const gainStepDb = 0.5;
const qStepRatio = 1.12;
const dragStartPx = 5;
const clipMarginDb = 0.05;

const bandKinds = {
  PK: { label: "Peak", tone: "peak", hasGain: true, hasQ: true, isCommon: true },
  LSC: { label: "Low shelf", tone: "shelf", hasGain: true, hasQ: false, isCommon: true },
  HSC: { label: "High shelf", tone: "shelf", hasGain: true, hasQ: false, isCommon: true },
  HP: { label: "Low cut", tone: "cut", hasGain: false, hasQ: false, isCommon: true },
  LP: { label: "High cut", tone: "cut", hasGain: false, hasQ: false, isCommon: true },
  LSF: { label: "Low shelf (slope)", tone: "shelf", hasGain: true, hasQ: false },
  HSF: { label: "High shelf (slope)", tone: "shelf", hasGain: true, hasQ: false },
  BP: { label: "Band pass", tone: "cut", hasGain: false, hasQ: true },
  NO: { label: "Notch", tone: "cut", hasGain: false, hasQ: true },
  AP: { label: "All pass", tone: "cut", hasGain: false, hasQ: true },
};
const commonTypes = Object.keys(bandKinds).filter((type) => bandKinds[type].isCommon);
const rareTypes = Object.keys(bandKinds).filter((type) => !bandKinds[type].isCommon);

const hd600Bands = [
  { on: true, type: "LSC", frequencyHz: 105, gainDb: 6.3, q: 0.7 },
  { on: true, type: "PK", frequencyHz: 160, gainDb: -2.6, q: 0.45 },
  { on: true, type: "PK", frequencyHz: 2700, gainDb: -2.1, q: 2.2 },
  { on: true, type: "PK", frequencyHz: 5900, gainDb: 3.2, q: 3.8 },
  { on: true, type: "HSC", frequencyHz: 10_000, gainDb: 2.4, q: 0.7 },
];
const podcastBands = [{ on: true, type: "HP", frequencyHz: 90, gainDb: 0, q: 0.7 }, { on: true, type: "PK", frequencyHz: 3000, gainDb: 2.5, q: 1 }];
const olderEarBands = [{ on: true, type: "PK", frequencyHz: 110, gainDb: -3.5, q: 1.2 }, { on: true, type: "PK", frequencyHz: 6800, gainDb: -2, q: 3 }];

const targetSets = {
  "GRAS 43AG-7": ["Harman over-ear 2018", "Harman over-ear 2013", "Diffuse field"],
  "GRAS RA0045": ["Harman in-ear 2019", "Diffuse field"],
  "HMS II.3": ["Rtings"],
};

// The bands that move a headphone from its first target to another, as fitTargetChange does in the extension.
const targetMoves = {
  "Harman over-ear 2013": [{ on: true, type: "LSC", frequencyHz: 105, gainDb: -1.5, q: 0.71 }],
  "Diffuse field": [{ on: true, type: "LSC", frequencyHz: 105, gainDb: -4, q: 0.71 }, { on: true, type: "PK", frequencyHz: 3000, gainDb: 2, q: 1.2 }],
};

const autoEqIndex = [
  { id: "oratory-hd600", name: "Sennheiser HD 600", source: "oratory1990", form: "Over-ear", rig: "GRAS 43AG-7", isPick: true, bands: hd600Bands },
  { id: "crinacle-hd600", name: "Sennheiser HD 600", source: "Crinacle", form: "Over-ear", rig: "GRAS 43AG-7", bands: [{ on: true, type: "LSC", frequencyHz: 105, gainDb: 5.6, q: 0.7 }, { on: true, type: "PK", frequencyHz: 3100, gainDb: -1.6, q: 2 }] },
  { id: "rtings-hd600", name: "Sennheiser HD 600", source: "Rtings", form: "Over-ear", rig: "HMS II.3", bands: [{ on: true, type: "LSC", frequencyHz: 105, gainDb: 4.8, q: 0.7 }] },
  { id: "oratory-hd650", name: "Sennheiser HD 650", source: "oratory1990", form: "Over-ear", rig: "GRAS 43AG-7", isPick: true, bands: [{ on: true, type: "LSC", frequencyHz: 105, gainDb: 5.9, q: 0.7 }, { on: true, type: "PK", frequencyHz: 5400, gainDb: 3.6, q: 3.1 }] },
  { id: "oratory-n700", name: "AKG N700NC M2", source: "oratory1990", form: "Over-ear", rig: "GRAS 43AG-7", isPick: true, bands: headphoneBands },
  { id: "oratory-xm4", name: "Sony WH-1000XM4", source: "oratory1990", form: "Over-ear", rig: "GRAS 43AG-7", isPick: true, bands: [{ on: true, type: "LSC", frequencyHz: 105, gainDb: -4.2, q: 0.7 }, { on: true, type: "PK", frequencyHz: 3500, gainDb: 4, q: 1.8 }] },
  { id: "oratory-wf", name: "Sony WF-1000XM4", source: "oratory1990", form: "In-ear", rig: "GRAS RA0045", isPick: true, bands: [{ on: true, type: "LSC", frequencyHz: 105, gainDb: -2.2, q: 0.7 }, { on: true, type: "PK", frequencyHz: 7200, gainDb: 3.4, q: 2.4 }] },
  { id: "rtings-airpods", name: "Apple AirPods Pro 2", source: "Rtings", form: "In-ear", rig: "HMS II.3", isPick: true, bands: [{ on: true, type: "PK", frequencyHz: 4200, gainDb: 2.8, q: 1.6 }] },
];

const starterSounds = [
  { name: "Flat", bands: [] },
  { name: "Warm", bands: [{ on: true, type: "LSC", frequencyHz: 120, gainDb: 3, q: 0.71 }, { on: true, type: "HSC", frequencyHz: 8000, gainDb: -2, q: 0.71 }] },
  { name: "Clear vocals", bands: [{ on: true, type: "PK", frequencyHz: 2500, gainDb: 3, q: 1 }] },
  { name: "Night listening", bands: [{ on: true, type: "LSC", frequencyHz: 100, gainDb: -3, q: 0.71 }, { on: true, type: "HSC", frequencyHz: 6000, gainDb: -3, q: 0.71 }] },
];

function cloneBands(bands) {
  return bands.filter((band) => bandKinds[band.type]).map(({ on, type, frequencyHz, gainDb, q }) => ({ on, type, frequencyHz, gainDb, q }));
}

function newLayer(name, source, bands, autoEq) {
  return { name, source, on: true, bands: cloneBands(bands), isEdited: false, autoEq };
}

// The one sound every screen reads: the panel in both forms, the Mac menu, the site and the store tile.
const sound = {
  heard: "Ichiru | YouTube Music",
  isEnabled: true,
  isComparing: false,
  isLevelMatched: false,
  isPopupOn: true,
  isAutoPreamp: true,
  preampDb: -6,
  sliders: { bass: 1.5, vocals: 0, treble: -1 },
  layers: {
    headphone: newLayer("AKG N700NC M2", "AutoEQ", headphoneBands, { id: "oratory-n700", rig: "GRAS 43AG-7", target: "Harman over-ear 2018" }),
    ear: newLayer("Ear test, 12 Oct", "Saved", parseAutoEqText(earText)),
    taste: newLayer("Warm and smooth", "Saved", parseAutoEqText(tasteText)),
  },
  presets: {
    headphone: { "Sennheiser HD 600": cloneBands(hd600Bands) },
    ear: { "Ear test, 12 Oct": cloneBands(parseAutoEqText(earText)), "Ear test, 3 Sep": cloneBands(olderEarBands) },
    taste: { "Warm and smooth": cloneBands(parseAutoEqText(tasteText)), "Podcast voice": cloneBands(podcastBands) },
  },
  sets: [
    { name: "HD 600 home", parts: { headphone: "Sennheiser HD 600", ear: "Ear test, 12 Oct", taste: "Warm and smooth" }, sliders: { bass: 1.5, vocals: 0, treble: -1 } },
    { name: "AKG commute", parts: { headphone: "AKG N700NC M2", ear: null, taste: "Podcast voice" }, sliders: { bass: 2, vocals: 1, treble: 0 } },
    { name: "Flat and quick", parts: { headphone: null, ear: null, taste: null }, sliders: { bass: 0, vocals: 2, treble: 0 } },
  ],
  selectedBand: null,
  soloBand: null,
};

function listEntries() {
  return roles.flatMap((role) => (sound.layers[role] ? sound.layers[role].bands.map((band) => ({ role, band })) : []));
}

function readSelected() {
  const entries = listEntries();
  const index = entries.findIndex((entry) => entry.band === sound.selectedBand);

  return { index, entry: entries[index] };
}

function listSliderBands(sliders) {
  return sliderSpecs.filter((spec) => sliders[spec.key] !== 0).map((spec) => ({ on: true, type: spec.type, frequencyHz: spec.frequencyHz, gainDb: sliders[spec.key], q: spec.q }));
}

function listLayerBands() {
  return roles.flatMap((role) => {
    const layer = sound.layers[role];
    return layer && layer.on ? layer.bands.filter((band) => band.on) : [];
  });
}

function listPlayedBands() {
  return [...listLayerBands(), ...listSliderBands(sound.sliders)];
}

function isEqOff() {
  return sound.isComparing || !sound.isEnabled;
}

// The heard config: A/B wins over Solo, as readHeardConfig does in the panel.
function listHeardBands() {
  if (isEqOff()) return [];
  if (sound.soloBand) return [{ ...sound.soloBand, on: true }];

  return listPlayedBands();
}

// Web Audio shelves and cuts take no Q, so the curve draws them with the fixed 1/sqrt(2) the API uses.
function toCurveBand(band) {
  return bandKinds[band.type].hasQ ? band : { ...band, q: Math.SQRT1_2 };
}

function sumDb(bands, frequencyHz) {
  return bands.reduce((total, band) => total + bandDb(toCurveBand(band), frequencyHz), 0);
}

function readPeakDb(bands) {
  let peakDb = 0;

  for (let index = 0; index <= 96; index += 1) peakDb = Math.max(peakDb, sumDb(bands, 20 * 1000 ** (index / 96)));

  return peakDb;
}

function readPreampDb() {
  return sound.isAutoPreamp ? -readPeakDb(listPlayedBands()) : sound.preampDb;
}

function canClip() {
  return sound.isEnabled && readPeakDb(listPlayedBands()) + readPreampDb() > clipMarginDb;
}

// A fake output level, near what a loud track reads, that moves with the spectrum.
function readLevelDb() {
  const wobbleDb = 0.8 * Math.sin(tickCount * 0.9);

  if (isEqOff()) return -15.9 + wobbleDb;

  return -14.4 + readPeakDb(listPlayedBands()) / 4 + readPreampDb() / 6 + wobbleDb;
}

function toAutoEqText(preampDb, bands) {
  const lines = [`Preamp: ${preampDb.toFixed(1)} dB`];

  bands.forEach((band, index) => {
    const gain = bandKinds[band.type].hasGain ? ` Gain ${band.gainDb.toFixed(1)} dB` : "";
    lines.push(`Filter ${index + 1}: ${band.on ? "ON" : "OFF"} ${band.type} Fc ${Math.round(band.frequencyHz)} Hz${gain} Q ${band.q.toFixed(2)}`);
  });

  return lines.join("\n");
}

function readWholeText() {
  return toAutoEqText(readPreampDb(), listPlayedBands());
}

function describeLayerName(layer) {
  return layer.isEdited ? `${layer.name}, edited` : layer.name;
}

function describeBandCount(bands) {
  return bands.length === 1 ? "1 band" : `${bands.length} bands`;
}

function describeMeasurement(item) {
  return [item.source, item.form, item.rig, targetSets[item.rig][0]].join(" · ");
}

function isSavedPreset(role) {
  const layer = sound.layers[role];
  return Boolean(layer) && layer.source === "Saved" && Boolean(sound.presets[role][layer.name]);
}

function dropBandChoice() {
  sound.selectedBand = null;
  sound.soloBand = null;
}

function markEdited(role) {
  if (role && sound.layers[role]) sound.layers[role].isEdited = true;
}

function replaceLayer(role, name, source, bands, autoEq) {
  sound.layers[role] = newLayer(name, source, bands, autoEq);
  dropBandChoice();
  commit();
}

function addBand(role, frequencyHz, gainDb) {
  sound.layers[role] ??= newLayer(role === "ear" ? "My ear tuning" : "My taste", "Your bands", []);

  const band = { on: true, type: "PK", frequencyHz: Math.round(frequencyHz), gainDb: Math.round(gainDb * 10) / 10, q: 1.41 };

  sound.layers[role].bands.push(band);
  sound.selectedBand = band;
  markEdited(role);
  commit();
}

function loadAutoEq(item, target) {
  const firstTarget = targetSets[item.rig][0];
  const chosen = target || firstTarget;
  const moves = chosen === firstTarget ? [] : targetMoves[chosen] || [];

  replaceLayer("headphone", item.name, "AutoEQ", [...item.bands, ...moves], { id: item.id, rig: item.rig, target: chosen });
}

// A slot plays when its layer holds that saved preset unedited. An empty slot plays Flat or turns the layer off.
function isSlotPlaying(role, presetName) {
  const layer = sound.layers[role];
  const hasPreset = Boolean(presetName) && Boolean(sound.presets[role][presetName]);

  if (!hasPreset && role === "headphone") return Boolean(layer) && layer.bands.length === 0;
  if (!hasPreset) return !layer || !layer.on;

  return Boolean(layer) && layer.on && layer.source === "Saved" && layer.name === presetName && !layer.isEdited;
}

function findPlayingSet() {
  const isPlaying = (set) => roles.every((role) => isSlotPlaying(role, set.parts[role])) && sliderSpecs.every((spec) => set.sliders[spec.key] === sound.sliders[spec.key]);
  const set = sound.sets.find(isPlaying);

  return set ? set.name : "";
}

function playSet(name) {
  const set = sound.sets.find((each) => each.name === name);

  if (!set) return;

  for (const role of roles) {
    const presetName = set.parts[role];
    const bands = presetName ? sound.presets[role][presetName] : null;

    if (bands) sound.layers[role] = newLayer(presetName, "Saved", bands);
    else if (role === "headphone") sound.layers.headphone = newLayer("Flat", "Starter sound", []);
    else if (sound.layers[role]) sound.layers[role].on = false;
  }

  sound.sliders = { ...set.sliders };
  dropBandChoice();
  commit();
}

function listUnsavedLayers() {
  return roles.filter((role) => {
    const layer = sound.layers[role];
    const hasBands = Boolean(layer) && layer.on && layer.bands.length > 0;
    return hasBands && !(isSavedPreset(role) && !layer.isEdited);
  });
}

function describeSetParts(set) {
  return roles.map((role) => {
    const name = set.parts[role];

    if (!name) return role === "headphone" ? "Flat" : `no ${roleNouns[role]}`;

    return sound.presets[role][name] ? name : `${name}, missing`;
  }).join(" · ");
}

// Every view paints from the one sound. A field you are typing in keeps its value until you leave it.
const views = [];

function commit() {
  for (const view of views) paintView(view);
}

const paneRegions = {
  listen: ["set-picker", "layers-head", "layers", "listen-plot", "nudge-head", "slider-bass", "slider-vocals", "slider-treble", "output-head", "slider-preamp", "level-match"],
  tune: ["zoom", "tune-plot", "legend", "chips", "inspector", "table"],
  library: ["library-tabs", "library-head", "library-current", "library-save", "library-measure", "library-actions", "library-drawer", "library-hint", "library-search", "library-results", "whole", "credits"],
};

function buildRegions(names) {
  return names.map((name) => (name.endsWith("-plot") ? `<div class="ui-plot" data-region="${name}"></div>` : `<div class="pn-region" data-region="${name}"></div>`)).join("");
}

function buildPane(name, isWide) {
  const title = isWide ? ui.sectionHeader({ variant: "column", label: paneTitles[name] }) : "";
  return `<section class="pn-pane" data-pane="${name}">${title}${buildRegions(paneRegions[name])}</section>`;
}

const paneTitles = { listen: "Listen", tune: "Tune", library: "Library" };

const viewForms = {
  narrow: () => `${buildRegions(["header", "tabs"])}<div class="pn-panes">${buildPane("listen")}${buildPane("tune")}${buildPane("library")}</div>`,
  wide: () => `${buildRegions(["header"])}<div class="pn-panes pn-panes--wide">${buildPane("listen", true)}${buildPane("tune", true)}${buildPane("library", true)}</div>`,
  start: () => buildRegions(["header", "start"]),
  header: () => buildRegions(["header"]),
  setsPicker: () => buildRegions(["set-picker", "layers"]),
  setsLibrary: () => buildRegions(paneRegions.library.slice(0, -2)),
  menu: () => buildRegions(["menu"]),
  tile: () => `<div class="pn-tile">${buildRegions(["tile-copy", "tile-plot"])}</div>`,
  hero: () => `<div class="pn-hero">${buildRegions(["hero-copy"])}<div class="pn-hero__demo">${buildRegions(["layers", "hero-plot"])}</div></div>`,
};

function mountView(host, form, settings = {}) {
  const view = {
    host,
    form,
    tab: "listen",
    zoom: "all",
    isTall: false,
    libraryTab: "headphone",
    open: { headphone: "", ear: "", taste: "", sets: "" },
    hints: {},
    query: "",
    saveName: "",
    pasteText: { headphone: "", ear: earText, taste: tasteText },
    isMoreOpen: false,
    isWholeOpen: false,
    isTableOpen: false,
    hasSetPicker: false,
    ...settings,
  };

  host.innerHTML = `<input type="file" class="pn-file" accept=".txt,text/plain" hidden />${viewForms[form]()}`;
  wireView(view);

  for (const plotHost of host.querySelectorAll(".ui-plot")) wirePlot(plotHost, view);

  views.push(view);
  paintView(view);

  return view;
}

function isTypingIn(region) {
  const active = document.activeElement;
  return region.contains(active) && active.matches("input, textarea");
}

function paintView(view) {
  for (const region of view.host.querySelectorAll("[data-region]")) {
    const name = region.dataset.region;

    if (name.endsWith("-plot")) {
      renderPlot(region, view);
      continue;
    }
    if (isTypingIn(region)) continue;

    const html = regionBuilders[name](view);

    region.hidden = html === "";
    region.innerHTML = html;
  }

  for (const pane of view.host.querySelectorAll("[data-pane]")) pane.hidden = view.form === "narrow" && pane.dataset.pane !== view.tab;

  if (!view.focusAfterPaint) return;

  const field = view.host.querySelector(view.focusAfterPaint);

  view.focusAfterPaint = "";

  if (field) field.focus();
}

function buildCompactLayerRow(role) {
  const layer = sound.layers[role];

  if (!layer) return "";

  return ui.stackRow({ tone: role, isOff: !layer.on, lead: ui.switch({ isOn: layer.on, act: "layer-on", value: role, title: `${roleLabelsOf(role)} on or off` }), caption: escapeHtml(`${roleLabelsOf(role)} · ${layer.source}`), name: escapeHtml(describeLayerName(layer)) });
}

function buildLayerRow(role, view) {
  const layer = sound.layers[role];

  if (view.form === "hero") return buildCompactLayerRow(role);

  if (!layer) {
    const words = { ear: "Add your ear tuning", taste: "Add your taste" };
    const add = ui.button({ size: "small", icon: "plus", label: words[role], act: "add-layer", value: role, title: `Open ${roleLabelsOf(role)} in the Library` });
    return ui.stackRow({ tone: role, isEmpty: true, caption: escapeHtml(roleLabelsOf(role)), name: "Not added", trail: add });
  }

  const toggle = ui.switch({ isOn: layer.on, act: "layer-on", value: role, title: `Turn the ${roleLabelsOf(role)} layer on or off` });
  const actions = [ui.button({ variant: "quiet", size: "small", label: "Change", act: "change", value: role, title: `Open ${roleLabelsOf(role)} in the Library` })];

  if (role !== "headphone") actions.push(ui.button({ variant: "quiet", size: "small", icon: "close", act: "remove-layer", value: role, title: `Take the ${roleNouns[role]} layer off` }));
  if (role === "headphone" && layer.bands.length > 0) actions.push(ui.button({ variant: "quiet", size: "small", icon: "close", act: "flat", title: "Clear the headphone layer to Flat" }));

  const extra = layer.autoEq ? buildTargetChoice(layer.autoEq) : "";

  return ui.stackRow({ tone: role, isOff: !layer.on, lead: toggle, caption: escapeHtml(`${roleLabelsOf(role)} · ${layer.source}`), name: escapeHtml(describeLayerName(layer)), extra, trail: actions.join("") });
}

function roleLabelsOf(role) {
  return layerNames[role];
}

// Only the targets for the headphone's rig. A target set of one shows its name only.
function buildTargetChoice(autoEq) {
  const targets = targetSets[autoEq.rig];

  if (targets.length < 2) return `<span class="pn-target">Target · ${escapeHtml(autoEq.target)}</span>`;

  const options = targets.map((target) => [target, target]);

  return `<span class="pn-target">${ui.field({ kind: "select", label: "Target", amount: autoEq.target, options, act: "target", title: "The sound AutoEQ tunes your headphone toward" })}</span>`;
}

function buildSliderRegion(key) {
  const spec = sliderSpecs.find((each) => each.key === key);
  return ui.sliderRow({ label: spec.label, hint: spec.hint, amount: sound.sliders[key], min: sliderRangeDb[0], max: sliderRangeDb[1], step: 0.5, act: "slider", key });
}

function buildChipRow(role, entries) {
  const chips = [];

  entries.forEach((entry, index) => {
    if (entry.role !== role) return;
    chips.push(ui.chip({ number: index + 1, label: hzLabel(entry.band.frequencyHz), tone: bandKinds[entry.band.type].tone, act: "band", value: index, isOn: entry.band === sound.selectedBand, isMuted: !entry.band.on, title: `${bandKinds[entry.band.type].label} at ${Math.round(entry.band.frequencyHz)} Hz` }));
  });

  const add = ui.chip({ variant: "add", icon: "plus", label: "Add band", act: "add-band", value: role, title: `Make a new band in ${roleLabelsOf(role)}` });
  const head = ui.sectionHeader({ label: roleLabelsOf(role), tone: role, count: chips.length });

  return `<div class="pn-chip-row">${head}<div class="ui-cluster">${chips.join("")}${add}</div></div>`;
}

const missingFieldNotes = {
  shelf: "A shelf has no Q. Web Audio shelves take a corner and a gain only, so goui keeps the Q of an AutoEQ shelf in the file and does not play it.",
  cut: "A cut has no gain and no Q here. It rolls off at a fixed slope.",
  pass: "This type has no gain.",
};

function readMissingFieldNote(type) {
  const kind = bandKinds[type];

  if (kind.hasGain && !kind.hasQ) return missingFieldNotes.shelf;
  if (!kind.hasGain && !kind.hasQ) return missingFieldNotes.cut;
  if (!kind.hasGain) return missingFieldNotes.pass;

  return "";
}

function buildInspector(view) {
  const { index, entry } = readSelected();

  if (!entry) return `<p class="ui-text-hint pn-empty">Tap a point or a chip to tune that band. Double click the graph to make a new band.</p>`;

  const { band } = entry;
  const kind = bandKinds[band.type];
  const controls = [
    ui.button({ size: "small", label: band.on ? "On" : "Off", isOn: band.on, act: "band-on", title: "Turn this band on or off" }),
    ui.button({ size: "small", label: "Solo", isOn: sound.soloBand === band, act: "band-solo", title: "Hear this band alone" }),
    ui.button({ variant: "danger", size: "small", label: "Delete", act: "band-delete", title: "Delete this band" }),
  ];
  const head = ui.sectionHeader({ variant: "section", step: index + 1, tone: kind.tone, label: kind.label, caption: `${roleLabelsOf(entry.role)} layer`, trail: `<span class="ui-cluster">${controls.join("")}</span>` });
  const isMoreShown = !kind.isCommon || view.isMoreOpen;
  const typeItems = [...commonTypes.map((type) => [type, bandKinds[type].label]), ["more", "More"]];
  const types = ui.segmented({ variant: "grid", items: typeItems, current: isMoreShown ? "more" : band.type, act: "band-type", title: "Band type" });
  const rareOptions = [...(kind.isCommon ? [["", "Pick a rarer type", true]] : []), ...rareTypes.map((type) => [type, bandKinds[type].label])];
  const rare = isMoreShown ? ui.field({ kind: "select", label: "Type", amount: kind.isCommon ? "" : band.type, options: rareOptions, act: "rare-type" }) : "";
  const fields = [ui.field({ kind: "stepper", amount: Math.round(band.frequencyHz), unit: "Hz", act: "band-field", key: "frequency", steps: "step", stepTitles: ["One semitone lower", "One semitone higher"] })];

  if (kind.hasGain) fields.push(ui.field({ kind: "stepper", amount: signedDb(band.gainDb), unit: "dB", act: "band-field", key: "gain", steps: "step", stepTitles: ["0.5 dB lower", "0.5 dB higher"] }));
  if (kind.hasQ) fields.push(ui.field({ kind: "stepper", amount: band.q.toFixed(2), unit: band.type === "PK" ? `Q, ${octavesFromQ(band.q).toFixed(1)} oct` : "Q", act: "band-field", key: "q", steps: "step", stepTitles: ["Wider band", "Narrower band"] }));

  const note = readMissingFieldNote(band.type);
  const noteHtml = note ? `<p class="ui-text-hint">${note}</p>` : "";

  return `<div class="ui-stack">${head}${types}${rare}<div class="ui-grid" style="--columns:${fields.length}">${fields.join("")}</div>${noteHtml}</div>`;
}

function buildTable(view) {
  const entries = listEntries();
  const head = ui.listRow({ variant: "columns", isHead: true, cells: ["Band", "Hz", "dB", "Q"] });
  const rows = entries.map((entry, index) => {
    const kind = bandKinds[entry.band.type];
    const number = ui.badge({ kind: "step", label: index + 1, tone: kind.tone });
    const cells = [`${number}<span>${escapeHtml(kind.label)}</span>`, Math.round(entry.band.frequencyHz), kind.hasGain ? signedDb(entry.band.gainDb) : "", entry.band.q.toFixed(2)];
    return ui.listRow({ variant: "columns", cells, act: "band", value: index, isSelected: entry.band === sound.selectedBand, isMuted: !entry.band.on });
  });

  return ui.expander({ variant: "disclosure", summary: "Number table", count: entries.length, isOpen: view.isTableOpen, act: "table", body: head + rows.join("") });
}

const libraryTabItems = [["headphone", "Headphone"], ["ear", "My ear"], ["taste", "Taste"], ["sets", "Sets"]];

function readLibraryRole(view) {
  return view.libraryTab === "sets" ? "" : view.libraryTab;
}

function buildPresetRows(role) {
  const layer = sound.layers[role];

  return Object.keys(sound.presets[role]).map((name) => {
    const remove = ui.button({ variant: "quiet", size: "small", icon: "close", act: "delete-preset", value: `${role}|${name}`, title: `Delete ${name}` });
    const isPlaying = Boolean(layer) && layer.source === "Saved" && layer.name === name;
    return ui.listRow({ name, detail: describeBandCount(sound.presets[role][name]), act: "pick-preset", value: `${role}|${name}`, isSelected: isPlaying, trail: remove });
  });
}

function buildGroup(label, rows, emptyText) {
  if (rows.length === 0 && !emptyText) return "";

  const body = rows.length > 0 ? rows.join("") : `<p class="ui-text-hint">${emptyText}</p>`;

  return `<div class="ui-stack ui-stack--tight">${ui.sectionHeader({ label, count: rows.length })}${body}</div>`;
}

function buildHeadphoneResults(view) {
  const query = view.query.trim().toLowerCase();
  const matches = (name) => name.toLowerCase().includes(query);
  const layer = sound.layers.headphone;
  const savedNames = Object.keys(sound.presets.headphone);
  const saved = buildPresetRows("headphone").filter((row, index) => matches(savedNames[index]));
  const found = query.length < 2 ? [] : autoEqIndex.filter((item) => matches(item.name));
  const autoEqRows = found.map((item) => {
    const pick = item.isPick ? ui.badge({ label: "AutoEQ's pick", tone: "good", title: "AutoEQ recommends this measurement of the headphone" }) : "";
    const isPlaying = Boolean(layer.autoEq) && layer.autoEq.id === item.id;
    return ui.listRow({ name: item.name, badge: pick, detail: describeMeasurement(item), act: "pick-autoeq", value: item.id, isSelected: isPlaying });
  });
  const starters = starterSounds.filter((starter) => matches(starter.name)).map((starter) => {
    const isPlaying = layer.source === "Starter sound" && layer.name === starter.name;
    return ui.listRow({ name: starter.name, detail: describeBandCount(starter.bands), act: "pick-starter", value: starter.name, isSelected: isPlaying });
  });
  const isEmptyQuery = query === "";
  const groups = [
    buildGroup("Your headphone presets", saved, isEmptyQuery ? "Nothing saved yet. Pick your headphone, then press Save." : ""),
    buildGroup("AutoEQ headphones", autoEqRows, ""),
    buildGroup("Starter sounds", starters, ""),
  ];
  const hasNothing = saved.length + autoEqRows.length + starters.length === 0;

  return groups.join("") + (hasNothing ? `<p class="ui-text-hint">No sound by that name.</p>` : "");
}

const layerListWords = {
  ear: { heading: "Your ear presets", empty: "Nothing saved yet. Run the test, paste the result, then press Save.", off: "No ear tuning", offDetail: "Headphone only" },
  taste: { heading: "Your taste presets", empty: "Nothing saved yet. Add bands in Tune, or paste AutoEQ text, then press Save.", off: "No taste", offDetail: "Headphone and ear only" },
};

function buildLayerResults(role) {
  const words = layerListWords[role];
  const off = ui.listRow({ name: words.off, detail: words.offDetail, act: "remove-layer", value: role, isSelected: !sound.layers[role] });

  return buildGroup(words.heading, buildPresetRows(role), words.empty) + off;
}

function buildSetResults() {
  const playing = findPlayingSet();
  const rows = sound.sets.map((set) => {
    const remove = ui.button({ variant: "quiet", size: "small", icon: "close", act: "delete-set", value: set.name, title: `Delete ${set.name}` });
    return ui.listRow({ name: set.name, detail: describeSetParts(set), act: "apply-set", value: set.name, isSelected: set.name === playing, trail: remove });
  });

  return buildGroup("Your Sets", rows, "Nothing saved yet. Set up the three layers, then press Save as Set.");
}

const libraryActionWords = [
  ["import", "Import", "Load a ParametricEQ.txt file into the"],
  ["paste", "Paste", "Paste AutoEQ text into the"],
  ["export", "Export", "Copy as AutoEQ text, the"],
];

function buildSaveDrawer(view, role) {
  const isSets = role === "";
  const openKey = isSets ? "sets" : role;
  const isOpen = isSets ? view.open.sets === "save" : view.open[role] === "save" || view.open[role] === "saveAs";

  if (!isOpen) return "";

  const name = view.saveName.trim();
  const exists = isSets ? sound.sets.some((set) => set.name === name) : Boolean(sound.presets[role][name]);
  const placeholder = isSets ? "Name for this Set" : `Name for this ${roleNouns[role]} preset`;
  const field = ui.field({ kind: "text", amount: view.saveName, placeholder, act: "save-name", key: openKey });
  const confirm = ui.button({ variant: "primary", size: "small", label: exists ? "Replace" : "Save", act: isSets ? "confirm-set" : "confirm-save", value: role });
  const note = isSets ? `<p class="ui-text-hint">It points at ${escapeHtml(describeSetParts({ parts: readSetParts() }))}, with Bass ${signedDb(sound.sliders.bass)}, Vocals ${signedDb(sound.sliders.vocals)} and Treble ${signedDb(sound.sliders.treble)} dB.</p>` : "";

  return ui.expander({ isOpen: true, body: `<div class="ui-cluster ui-cluster--fill">${field}${confirm}</div>${note}` });
}

function readSetParts() {
  const parts = {};

  for (const role of roles) {
    const layer = sound.layers[role];
    const isFilled = Boolean(layer) && layer.on && layer.bands.length > 0;
    parts[role] = isFilled ? layer.name : null;
  }

  return parts;
}

function buildActionDrawer(view, role) {
  const open = view.open[role];

  if (open === "paste") {
    const area = ui.field({ kind: "area", amount: view.pasteText[role], placeholder: role === "ear" ? "Paste the EQByEar result here" : "Paste AutoEQ text here", act: "paste-text", key: role });
    const apply = ui.button({ variant: "primary", size: "small", label: "Apply", act: "apply", value: role });
    return ui.expander({ isOpen: true, body: `${area}<div class="ui-split"><span class="ui-text-fine">One ParametricEQ.txt, as text</span>${apply}</div>` });
  }

  if (open === "export") {
    const layer = sound.layers[role];
    const bands = layer ? layer.bands : [];
    const area = ui.field({ kind: "area", amount: toAutoEqText(-readPeakDb(bands), bands), isReadOnly: true, rows: 5 });
    return ui.expander({ isOpen: true, body: `${area}<span class="ui-text-fine">${escapeHtml(roleLabelsOf(role))} alone, as AutoEQ text. Copy it out.</span>` });
  }

  return "";
}

function buildHeader(view) {
  const level = readLevelDb();
  const isClipping = canClip();
  const isHearing = view.isHearing !== false && !(view.isPopup && !sound.isPopupOn);
  const title = view.heard || sound.heard;
  const caption = sound.isComparing ? "Holding A/B, the EQ is off" : "Hearing";
  const hearing = isHearing
    ? `<span class="pn-hearing"><small>${caption}</small><b>${escapeHtml(title)}</b></span>`
    : `<span class="pn-hearing is-instruction"><b>${escapeHtml(view.instruction || "Click the goui icon on a tab that plays sound.")}</b></span>`;
  const meterTitle = isClipping ? "The EQ can clip. Turn the preamp down or press Auto." : "Output level. No clipping.";
  const meter = isHearing
    ? `<span data-level>${ui.badge({ kind: "dot", tone: isClipping ? "danger" : "good", label: `${level.toFixed(1)} dB`, title: meterTitle })}</span>`
    : ui.badge({ kind: "dot", tone: "muted", label: "-- dB", title: "goui hears nothing yet" });
  const power = view.isPopup ? ui.button({ size: "small", icon: "power", label: sound.isPopupOn ? "ON" : "OFF", isOn: sound.isPopupOn, tone: "good", act: "popup-power", title: "Turn goui on or off for this window" }) : "";
  const help = ui.button({ variant: "quiet", size: "small", label: "?", act: "help", title: "How to use goui" });
  const hold = ui.button({ variant: "hold", label: "A/B", isHeld: sound.isComparing, extra: 'data-hold="panel"', title: "Hold to hear the sound with the EQ off" });
  const eqSwitch = ui.switch({ isOn: sound.isEnabled, act: "enabled", title: "Turn the EQ on or off" });

  return `<div class="pn-head"><div class="ui-split"><span class="pn-brand"><img src="../icons/icon32.png" alt="" width="18" height="18" />goui</span><span class="ui-cluster">${power}${help}${hold}${eqSwitch}</span></div><div class="ui-split">${hearing}${meter}</div></div>`;
}

function buildShot(step) {
  const url = ui.field({ kind: "readonly", amount: "radio.example.com", title: "The address bar" });
  const goui = `<span class="pn-shot__goui"><img src="../icons/icon32.png" alt="" width="16" height="16" />${ui.badge({ label: "ON", tone: "good" })}</span>`;
  const shots = {
    pin: `${url}${ui.button({ variant: "quiet", size: "small", icon: "puzzle", isOn: true, title: "Extensions" })}<div class="pn-shot__menu">${ui.listRow({ variant: "dense", name: "goui", lead: '<img src="../icons/icon32.png" alt="" width="14" height="14" />', trail: ui.button({ variant: "quiet", size: "small", icon: "pin", isOn: true, title: "Pin" }) })}</div>`,
    play: `<span class="ui-cluster">${ui.chip({ variant: "tag", icon: "speaker", label: "Lofi radio", isOn: true })}${ui.chip({ variant: "tag", label: "Mail" })}</span>${url}`,
    click: `${url}${goui}${ui.button({ variant: "quiet", size: "small", icon: "puzzle", title: "Extensions" })}`,
  };

  return `<div class="pn-shot pn-shot--${step}">${shots[step]}</div>`;
}

const startSteps = [
  ["pin", "Pin goui", "Click the puzzle piece in your toolbar, then pin goui so it's always one click away."],
  ["play", "Play something", "Any tab with sound works. Music, a video, a radio stream."],
  ["click", "Click the goui icon", "goui starts listening to that tab, and the icon shows a green ON."],
];

function buildStart() {
  const steps = startSteps.map(([key, title, text], index) => `<div class="pn-step">${ui.sectionHeader({ variant: "section", step: index + 1, tone: "accent", label: title, caption: text })}${buildShot(key)}</div>`);
  const head = ui.sectionHeader({ variant: "title", label: "Get started", caption: "Different ear, different head, different sound." });

  return `<div class="ui-stack ui-stack--loose">${head}${steps.join("")}${ui.button({ variant: "primary", isWide: true, label: "Open the full guide", act: "help" })}</div>`;
}

const menuWords = {
  wide: "Wide panel opens the panel at 1100 px, in three columns. The wide form above is that panel.",
  restart: "The engine restarts. The sound pauses for a moment.",
  reload: "The panel reloads. The sound keeps playing.",
  update: "goui installs 0.1.8 and restarts the engine. Your settings stay.",
  quit: "goui quits, and the Mac plays its sound with no EQ.",
};

function buildMenu(view) {
  const playing = findPlayingSet();
  const item = (name, key, extra = {}) => ui.listRow({ variant: "dense", name, act: "menu", value: key, lead: '<span class="pn-menu__tick"></span>', ...extra });
  const sets = sound.sets.map((set) => ui.listRow({ variant: "dense", name: set.name, act: "apply-set", value: set.name, isSelected: set.name === playing, lead: `<span class="pn-menu__tick">${set.name === playing ? iconHtml("check") : ""}</span>` }));
  const setsRow = ui.listRow({ variant: "dense", name: "Sets", lead: '<span class="pn-menu__tick"></span>', badge: ui.badge({ label: "Proposed", tone: "accent" }), trail: iconHtml("next"), isSelected: true });
  const update = item("Update to 0.1.8", "update", { badge: ui.badge({ label: "New", tone: "good" }) });
  const main = `<div class="pn-menu">${item("Wide panel", "wide")}${item("Restart engine", "restart")}${item("Reload panel", "reload")}<hr class="pn-menu__rule" />${setsRow}<hr class="pn-menu__rule" />${update}<hr class="pn-menu__rule" />${item("Quit goui", "quit")}</div>`;
  const sub = `<div class="pn-menu pn-menu--sub">${sets.join("")}</div>`;
  const command = ui.field({ kind: "code", amount: `goui set "${playing || sound.sets[0].name}"`, title: "The same switch from Terminal" });
  const hint = view.hints.menu ? `<p class="ui-text-hint">${escapeHtml(view.hints.menu)}</p>` : "";

  return `<div class="pn-menubar"><span>Finder</span><span>File</span><span>Edit</span><span class="pn-menubar__item is-open"><img src="../icons/icon32.png" alt="" width="14" height="14" /></span><span class="pn-menubar__clock">Thu 09:41</span></div><div class="pn-menu-pair">${main}${sub}</div><div class="ui-stack ui-stack--tight pn-menu-command">${ui.sectionHeader({ label: "From Terminal" })}${command}${hint}</div>`;
}

function buildTileCopy() {
  const rows = roles.map(buildCompactLayerRow);

  return `<span class="pn-brand pn-brand--large"><img src="../icons/icon32.png" alt="" width="26" height="26" />goui</span><p class="pn-tile__line">Different ear, different head, different sound.</p><div class="ui-stack ui-stack--chain">${rows.join("")}</div>`;
}

function buildHeroCopy(view) {
  const install = 'curl -fsSL https://raw.githubusercontent.com/wyndhamharyata/goui/main/mac/install.sh | sh';
  const copy = ui.button({ size: "small", label: view.hints.copy || "Copy", act: "copy", title: "Copy the install line" });
  const facts = [["No account", "muted"], ["No telemetry", "muted"], ["AutoEQ and EQByEar", "muted"], ["MIT licence", "muted"]].map(([label, tone]) => ui.badge({ label, tone }));
  const links = [
    ui.button({ variant: "primary", label: "Add to Chrome", href: "https://chromewebstore.google.com/detail/goui/ghldfngciehgonecnnihpdeghejkndap" }),
    ui.button({ label: "goui for the Mac", href: "https://goui.mwyndham.dev/mac" }),
  ];

  return `<div class="ui-stack ui-stack--loose">${ui.sectionHeader({ label: "An EQ for your headphone, your ear and your taste" })}<h3 class="pn-hero__title">Different ear, different head, different sound.</h3><p class="pn-hero__lede">goui runs one browser tab through a parametric EQ. goui for the Mac runs every sound the Mac plays through the same one. AutoEQ makes your headphone neutral, EQByEar tunes it to your ear, and your taste goes on top.</p><div class="ui-cluster">${links.join("")}</div><div class="ui-cluster ui-cluster--fill">${ui.field({ kind: "code", amount: install, title: "The Mac install line" })}${copy}</div><div class="ui-cluster">${facts.join("")}</div></div>`;
}

const legendKeys = [
  ["line", "accent", "EQ curve"],
  ["fill", "spectrum", "Live sound"],
  ["fill", "louder", "Louder"],
  ["fill", "quieter", "Quieter"],
  ["dot", "peak", "Peak"],
  ["dot", "shelf", "Shelf"],
  ["dot", "cut", "Cut"],
  ["dash", "headphone", "Headphone"],
  ["dash", "ear", "My ear"],
  ["dash", "taste", "Taste"],
];

const regionBuilders = {
  header: buildHeader,
  tabs: (view) => (view.form === "narrow" ? ui.tabs({ items: [["listen", "Listen"], ["tune", "Tune"], ["library", "Library"]], current: view.tab, act: "tab" }) : ""),
  "set-picker": (view) => {
    if (!view.hasSetPicker) return "";

    const playing = findPlayingSet();
    const options = [...(playing ? [] : [["", "No Set plays now", true]]), ...sound.sets.map((set) => [set.name, set.name])];
    const picker = ui.field({ kind: "select", amount: playing, options, act: "set-pick", title: "Play a Set: one headphone, one ear and one taste preset, and the sliders" });

    return ui.stackRow({ tone: "accent", caption: "Set", name: picker, trail: ui.badge({ label: "Proposed", tone: "accent" }) });
  },
  "layers-head": () => ui.sectionHeader({ label: "Your sound", count: `${roles.filter((role) => sound.layers[role] && sound.layers[role].on).length} of 3 on` }),
  layers: (view) => `<div class="ui-stack ui-stack--chain">${roles.map((role) => buildLayerRow(role, view)).join("")}</div>`,
  "nudge-head": () => ui.sectionHeader({ label: "Nudge", trail: ui.badge({ label: "On top of all three", tone: "muted" }) }),
  "slider-bass": () => buildSliderRegion("bass"),
  "slider-vocals": () => buildSliderRegion("vocals"),
  "slider-treble": () => buildSliderRegion("treble"),
  "output-head": () => ui.sectionHeader({ label: "Output" }),
  "slider-preamp": () => {
    const auto = ui.button({ size: "small", label: "Auto", isOn: sound.isAutoPreamp, act: "auto", title: "Set the preamp from the largest boost, so the sound never clips" });
    return ui.sliderRow({ label: "Preamp", hint: sound.isAutoPreamp ? "Auto" : "Manual", amount: Number(readPreampDb().toFixed(1)), min: preampRangeDb[0], max: preampRangeDb[1], step: 0.1, act: "slider", key: "preamp", trail: auto });
  },
  "level-match": () => ui.stackRow({ lead: ui.switch({ isOn: sound.isLevelMatched, act: "level-match", title: "Level match" }), caption: "Keep the preamp while A/B is held", name: "Level match" }),
  zoom: (view) => {
    const zoom = ui.segmented({ items: [["all", "All"], ["lows", "Lows"], ["mids", "Mids"], ["highs", "Highs"]], current: view.zoom, act: "zoom", title: "Zoom" });
    const tall = ui.button({ size: "small", label: "Tall", isOn: view.isTall, act: "tall", title: "Turn the graph so frequency runs down the panel" });
    return `<div class="ui-split">${zoom}${tall}</div>`;
  },
  legend: () => `<div class="ui-cluster ui-cluster--legend">${legendKeys.map(([key, tone, label]) => ui.badge({ kind: "key", key, tone, label })).join("")}</div>`,
  chips: () => {
    const entries = listEntries();
    return `<div class="ui-stack">${roles.map((role) => buildChipRow(role, entries)).join("")}</div>`;
  },
  inspector: buildInspector,
  table: buildTable,
  "library-tabs": (view) => ui.tabs({ items: libraryTabItems, current: view.libraryTab, act: "library-tab", size: "small" }),
  "library-head": (view) => {
    const role = readLibraryRole(view);

    if (!role) return ui.sectionHeader({ variant: "section", step: "S", tone: "accent", label: "Sets", caption: "Your headphone, your ear and your taste in one press. A Set points at three presets by name, with the sliders." });

    return ui.sectionHeader({ variant: "section", step: roles.indexOf(role) + 1, tone: role, label: roleLabelsOf(role), caption: sectionCaptions[role] });
  },
  "library-current": (view) => {
    const role = readLibraryRole(view);

    if (!role) {
      const playing = findPlayingSet();
      const save = ui.button({ variant: "primary", size: "small", label: "Save as Set", act: "save-set", isOn: view.open.sets === "save", title: "Keep the three layers and the sliders as one Set" });
      return ui.stackRow({ tone: "accent", caption: playing ? "The Set that plays" : "No Set plays now", name: escapeHtml(playing || "Save your first Set"), trail: save });
    }

    const layer = sound.layers[role];
    const isSaved = isSavedPreset(role);
    const hasNothingNew = isSaved && !layer.isEdited;
    let caption = "Nothing yet";

    if (layer) caption = isSaved ? "Your preset" : `${layer.source}, not saved yet`;

    const save = ui.button({ variant: "primary", size: "small", label: isSaved ? "Save changes" : "Save", act: "save", value: role, isDisabled: !layer || hasNothingNew });
    const saveAs = ui.button({ size: "small", label: "Save as new", act: "save-as", value: role, isDisabled: !layer, isOn: view.open[role] === "saveAs", title: "Keep this as a new preset under another name" });

    return ui.stackRow({ tone: role, caption, name: escapeHtml(layer ? describeLayerName(layer) : emptyNames[role]), trail: save + saveAs });
  },
  "library-save": (view) => buildSaveDrawer(view, readLibraryRole(view)),
  "library-measure": (view) => (view.libraryTab === "ear" ? ui.button({ isWide: true, icon: "external", label: "Measure my ear with EQByEar", act: "measure", title: "Open eqbyear.com in a new tab, with My ear off, to measure your ear" }) : ""),
  "library-actions": (view) => {
    const role = readLibraryRole(view);

    if (!role) return "";

    const buttons = libraryActionWords.map(([key, label, title]) => ui.button({ size: "small", label, act: key, value: role, isOn: key === "import" ? undefined : view.open[role] === key, title: `${title} ${roleNouns[role]} layer` }));

    return `<div class="ui-grid" style="--columns:3">${buttons.join("")}</div>`;
  },
  "library-drawer": (view) => {
    const role = readLibraryRole(view);
    return role ? buildActionDrawer(view, role) : "";
  },
  "library-hint": (view) => {
    const hint = view.hints[view.libraryTab];
    return hint ? `<p class="ui-text-hint tone-${hint.tone || "muted"}">${escapeHtml(hint.text)}</p>` : "";
  },
  "library-search": (view) => (view.libraryTab === "headphone" ? ui.field({ kind: "search", amount: view.query, placeholder: "Search AutoEQ or your presets, for example HD 600", act: "search" }) : ""),
  "library-results": (view) => {
    if (view.libraryTab === "headphone") return buildHeadphoneResults(view);
    if (view.libraryTab === "sets") return buildSetResults();

    return buildLayerResults(view.libraryTab);
  },
  whole: (view) => {
    const button = ui.button({ isWide: true, label: "Export the whole sound", isOn: view.isWholeOpen, act: "whole", title: "All three layers and the sliders as one AutoEQ file" });
    const text = ui.field({ kind: "area", amount: readWholeText(), isReadOnly: true, rows: 6 });
    return `<div class="ui-stack">${ui.sectionHeader({ label: "Whole sound" })}<p class="ui-text-hint">All three layers and the sliders in one AutoEQ file, for other apps.</p>${button}${ui.expander({ isOpen: view.isWholeOpen, body: text })}</div>`;
  },
  credits: () => `<p class="ui-text-fine">Headphone profiles from AutoEQ by Jaakko Pasanen. Ear test from EQByEar. Icon art from Google Material Icons. goui is under the MIT licence. ${ui.button({ variant: "quiet", size: "small", label: "Credits", act: "help", title: "Open the credits in the guide" })}</p>`,
  start: buildStart,
  menu: buildMenu,
  "tile-copy": buildTileCopy,
  "hero-copy": buildHeroCopy,
};

function scrollToScreen(id) {
  const target = byId(id);

  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toggleOpen(view, key, action) {
  view.open[key] = view.open[key] === action ? "" : action;
  view.hints[key] = null;
}

function showLibrary(view, role) {
  view.libraryTab = role;
  if (view.form === "narrow") view.tab = "library";
}

function saveLayerPreset(view, role, name) {
  const layer = sound.layers[role];
  const isUpdate = Boolean(sound.presets[role][name]);

  sound.presets[role][name] = cloneBands(layer.bands);
  Object.assign(layer, { name, source: "Saved", isEdited: false, autoEq: undefined });
  view.open[role] = "";
  view.hints[role] = { text: `${isUpdate ? "Updated" : "Saved"} ${name}.` };
  commit();
}

function applyText(view, role, text, name, source) {
  const bands = cloneBands(parseAutoEqText(text));

  if (bands.length === 0) {
    view.hints[role] = { text: "No AutoEQ filters found in that text.", tone: "danger" };
    paintView(view);
    return;
  }

  view.open[role] = "";
  view.hints[role] = { text: `Applied ${describeBandCount(bands)} to ${roleLabelsOf(role)}. Press Save to keep it.` };
  replaceLayer(role, name, source, bands);
}

function splitPair(value) {
  const at = value.indexOf("|");
  return [value.slice(0, at), value.slice(at + 1)];
}

function stepBand(band, key, direction) {
  if (key === "frequency") band.frequencyHz = Math.round(clampNumber(band.frequencyHz * 2 ** (direction / 12), 20, 20_000));
  if (key === "gain") band.gainDb = clampNumber(Math.round((band.gainDb + direction * gainStepDb) * 10) / 10, ...bandGainRangeDb);
  if (key === "q") band.q = clampNumber(band.q * qStepRatio ** direction, ...bandQRange);
}

function setBandField(band, key, number) {
  if (!Number.isFinite(number)) return;
  if (key === "frequency") band.frequencyHz = clampNumber(number, 20, 20_000);
  if (key === "gain") band.gainDb = clampNumber(number, ...bandGainRangeDb);
  if (key === "q") band.q = clampNumber(number, ...bandQRange);
}

function commitBandEdit() {
  const { entry } = readSelected();

  if (entry) markEdited(entry.role);

  commit();
}

const clickActions = {
  tab: (value, view) => { view.tab = value; paintView(view); },
  enabled: () => { sound.isEnabled = !sound.isEnabled; commit(); },
  "popup-power": () => { sound.isPopupOn = !sound.isPopupOn; commit(); },
  help: () => scrollToScreen("screen-guide"),
  "layer-on": (role) => { sound.layers[role].on = !sound.layers[role].on; commit(); },
  change: (role, view) => { showLibrary(view, role); paintView(view); },
  "add-layer": (role, view) => {
    showLibrary(view, role);
    if (role === "ear") view.open.ear = "paste";
    paintView(view);
  },
  "remove-layer": (role) => { delete sound.layers[role]; dropBandChoice(); commit(); },
  flat: () => replaceLayer("headphone", "Flat", "Starter sound", []),
  auto: () => {
    if (sound.isAutoPreamp) sound.preampDb = Number(readPreampDb().toFixed(1));
    sound.isAutoPreamp = !sound.isAutoPreamp;
    commit();
  },
  "level-match": () => { sound.isLevelMatched = !sound.isLevelMatched; commit(); },
  zoom: (value, view) => { view.zoom = value; paintView(view); },
  tall: (value, view) => { view.isTall = !view.isTall; paintView(view); },
  band: (value) => {
    const index = Number(value);
    sound.selectedBand = readSelected().index === index ? null : listEntries()[index].band;
    commit();
  },
  "add-band": (role) => addBand(role, 1000, 0),
  "band-type": (value, view) => {
    if (value === "more") {
      view.isMoreOpen = true;
      paintView(view);
      return;
    }
    view.isMoreOpen = false;
    sound.selectedBand.type = value;
    commitBandEdit();
  },
  "band-on": () => { sound.selectedBand.on = !sound.selectedBand.on; commitBandEdit(); },
  "band-solo": () => { sound.soloBand = sound.soloBand === sound.selectedBand ? null : sound.selectedBand; commit(); },
  "band-delete": () => {
    const { entry } = readSelected();
    const layer = sound.layers[entry.role];
    layer.bands.splice(layer.bands.indexOf(entry.band), 1);
    markEdited(entry.role);
    dropBandChoice();
    commit();
  },
  step: (value) => {
    const [key, direction] = value.split(":");
    stepBand(sound.selectedBand, key, Number(direction));
    commitBandEdit();
  },
  table: (value, view) => { view.isTableOpen = !view.isTableOpen; paintView(view); },
  "library-tab": (role, view) => { view.libraryTab = role; paintView(view); },
  save: (role, view) => {
    if (isSavedPreset(role)) {
      saveLayerPreset(view, role, sound.layers[role].name);
      return;
    }
    toggleOpen(view, role, "save");
    view.saveName = sound.layers[role].name;
    view.focusAfterPaint = "[data-act='save-name']";
    paintView(view);
  },
  "save-as": (role, view) => {
    toggleOpen(view, role, "saveAs");
    view.saveName = "";
    view.focusAfterPaint = "[data-act='save-name']";
    paintView(view);
  },
  "confirm-save": (role, view) => {
    const name = view.saveName.trim();

    if (name) {
      saveLayerPreset(view, role, name);
      return;
    }
    view.hints[role] = { text: "Give the preset a name first.", tone: "danger" };
    paintView(view);
  },
  import: (role, view) => {
    view.importRole = role;
    view.host.querySelector(".pn-file").click();
  },
  paste: (role, view) => { toggleOpen(view, role, "paste"); paintView(view); },
  export: (role, view) => { toggleOpen(view, role, "export"); paintView(view); },
  apply: (role, view) => applyText(view, role, view.pasteText[role], pastedNames[role], "Pasted"),
  measure: (value, view) => {
    if (sound.layers.ear) sound.layers.ear.on = false;
    view.hints.ear = { text: "My ear is off, so the test hears the headphone alone. EQByEar opens in a new tab." };
    commit();
  },
  "pick-preset": (value) => {
    const [role, name] = splitPair(value);
    replaceLayer(role, name, "Saved", sound.presets[role][name]);
  },
  "delete-preset": (value) => {
    const [role, name] = splitPair(value);
    const layer = sound.layers[role];
    delete sound.presets[role][name];
    if (layer && layer.source === "Saved" && layer.name === name) layer.source = "Deleted preset";
    commit();
  },
  "pick-starter": (name, view) => {
    const starter = starterSounds.find((each) => each.name === name);
    view.query = "";
    if (view.form === "narrow") view.tab = "listen";
    replaceLayer("headphone", starter.name, "Starter sound", starter.bands);
  },
  "pick-autoeq": (id, view) => {
    view.query = "";
    if (view.form === "narrow") view.tab = "listen";
    loadAutoEq(autoEqIndex.find((item) => item.id === id));
  },
  whole: (value, view) => { view.isWholeOpen = !view.isWholeOpen; paintView(view); },
  "save-set": (value, view) => {
    const unsaved = listUnsavedLayers();

    if (unsaved.length > 0) {
      const names = unsaved.map(roleLabelsOf).join(" and ");
      view.open.sets = "";
      view.hints.sets = { text: `Save ${names} as a preset first. A Set points at presets by name, so each layer with bands needs one.`, tone: "danger" };
      paintView(view);
      return;
    }

    toggleOpen(view, "sets", "save");
    view.saveName = "";
    view.focusAfterPaint = "[data-act='save-name']";
    paintView(view);
  },
  "confirm-set": (value, view) => {
    const name = view.saveName.trim();

    if (!name) {
      view.hints.sets = { text: "Give the Set a name first.", tone: "danger" };
      paintView(view);
      return;
    }

    sound.sets = [...sound.sets.filter((set) => set.name !== name), { name, parts: readSetParts(), sliders: { ...sound.sliders } }];
    view.open.sets = "";
    view.hints.sets = { text: `Saved ${name}. It is in the Mac menu bar too.` };
    commit();
  },
  "apply-set": (name) => playSet(name),
  "delete-set": (name) => { sound.sets = sound.sets.filter((set) => set.name !== name); commit(); },
  menu: (key, view) => {
    view.hints.menu = menuWords[key];
    paintView(view);
    if (key === "wide") scrollToScreen("panel-wide-title");
  },
  copy: (value, view) => {
    const line = view.host.querySelector(".ui-field--code input").value;
    navigator.clipboard.writeText(line).then(() => { view.hints.copy = "Copied"; }, () => { view.hints.copy = "Select it"; }).finally(() => paintView(view));
  },
};

const inputActions = {
  slider: (input) => {
    const key = input.dataset.value;
    const valueDb = Number(input.value);
    const min = Number(input.min);
    const max = Number(input.max);
    const share = (number) => ((number - min) / (max - min)) * 100;

    if (key === "preamp") {
      sound.isAutoPreamp = false;
      sound.preampDb = valueDb;
    } else {
      sound.sliders[key] = valueDb;
    }

    input.setAttribute("style", readSliderFill(share(0), share(valueDb)));
    input.nextElementSibling.textContent = `${signedDb(valueDb)} dB`;
    commit();
  },
  search: (input, view) => { view.query = input.value; paintView(view); },
  "save-name": (input, view) => {
    view.saveName = input.value;

    const confirm = input.closest(".ui-expander").querySelector("[data-act^='confirm'] span");
    const name = input.value.trim();
    const isSets = input.dataset.value === "sets";
    const exists = isSets ? sound.sets.some((set) => set.name === name) : Boolean(sound.presets[input.dataset.value][name]);

    confirm.textContent = exists ? "Replace" : "Save";
  },
  "paste-text": (input, view) => { view.pasteText[input.dataset.value] = input.value; },
  "band-field": (input) => {
    setBandField(sound.selectedBand, input.dataset.value, Number(input.value.replace(",", ".")));
    commitBandEdit();
  },
};

const changeActions = {
  target: (select) => loadAutoEq(autoEqIndex.find((item) => item.id === sound.layers.headphone.autoEq.id), select.value),
  "set-pick": (select) => playSet(select.value),
  "rare-type": (select, view) => {
    view.isMoreOpen = false;
    sound.selectedBand.type = select.value;
    commitBandEdit();
  },
};

function wireView(view) {
  const { host } = view;

  host.addEventListener("click", (event) => {
    const target = event.target.closest("[data-act]");

    if (!target || target.matches("input, select, textarea") || target.disabled) return;

    const action = clickActions[target.dataset.act];

    if (action) action(target.dataset.value, view);
  });
  host.addEventListener("input", (event) => {
    const action = inputActions[event.target.dataset.act];

    if (action) action(event.target, view);
  });
  host.addEventListener("change", (event) => {
    const action = changeActions[event.target.dataset.act];

    if (action) action(event.target, view);
  });
  host.addEventListener("keydown", (event) => {
    const isEnter = event.key === "Enter" && event.target.dataset.act === "save-name";

    if (isEnter) host.querySelector("[data-act^='confirm']").click();
  });
  // A field you leave shows the value the sound holds, unless the press moved to another part of this view.
  host.addEventListener("focusout", (event) => {
    if (!host.contains(event.relatedTarget)) requestAnimationFrame(() => paintView(view));
  });
  host.querySelector(".pn-file").addEventListener("change", async (event) => {
    const [file] = event.target.files;

    event.target.value = "";

    if (!file) return;

    const dot = file.name.lastIndexOf(".");

    applyText(view, view.importRole, await file.text(), dot > 0 ? file.name.slice(0, dot) : file.name, "From a file");
  });
}

// A/B is a held button. The press turns the EQ off and any release anywhere turns it back on.
function setComparing(isOn) {
  if (sound.isComparing === isOn) return;

  sound.isComparing = isOn;
  commit();
}

document.addEventListener("pointerdown", (event) => {
  const hold = event.target.closest("[data-hold]");

  if (!hold) return;

  if (hold.dataset.hold === "panel") setComparing(true);
  else holdGalleryButton(true);
});
document.addEventListener("keydown", (event) => {
  const hold = event.target.closest && event.target.closest("[data-hold='panel']");
  const isHoldKey = event.key === " " || event.key === "Enter";

  if (hold && isHoldKey && !event.repeat) {
    event.preventDefault();
    setComparing(true);
  }
});

for (const type of ["pointerup", "pointercancel", "blur", "keyup"]) {
  window.addEventListener(type, () => {
    setComparing(false);
    holdGalleryButton(false);
  });
}

// The plot. One drawing, styled only by the tokens through its SVG classes.
let plotCount = 0;

function readPlotOptions(view, name) {
  const base = { zoom: "all", isTall: false, height: 150, tallHeight: 440, hasRegions: true, hasLabels: true, hasPoints: false, isInteractive: false };

  if (name === "tune-plot") return { ...base, zoom: view.zoom, isTall: view.isTall, height: view.form === "wide" ? 300 : 220, hasPoints: true, isInteractive: true };
  if (name === "hero-plot") return { ...base, height: 210 };
  if (name === "tile-plot") return { ...base, height: 150, hasRegions: false, hasLabels: false };

  return base;
}

function measurePlot(host, options) {
  const width = host.clientWidth > 0 ? host.clientWidth : 336;
  const height = options.isTall ? options.tallHeight : options.height;
  const top = options.isTall ? 18 : 8;
  const bottom = options.isTall ? 6 : 18;
  const left = options.hasLabels ? 30 : 6;

  return { width, height, left, top, plotWidth: width - left - 8, plotHeight: height - top - bottom, zoom: options.zoom, isTall: options.isTall };
}

function plotRatio(frame, frequencyHz) {
  const [lowHz, highHz] = zooms[frame.zoom];
  return Math.log(frequencyHz / lowHz) / Math.log(highHz / lowHz);
}

function plotFrequency(frame, ratio) {
  const [lowHz, highHz] = zooms[frame.zoom];
  return clampNumber(lowHz * (highHz / lowHz) ** ratio, 20, 20_000);
}

function plotPlace(frame, frequencyHz, gainDb) {
  const along = plotRatio(frame, frequencyHz);
  const across = (clampNumber(gainDb, -rangeDb, rangeDb) + rangeDb) / (2 * rangeDb);

  if (frame.isTall) return { x: frame.left + across * frame.plotWidth, y: frame.top + along * frame.plotHeight };

  return { x: frame.left + along * frame.plotWidth, y: frame.top + (1 - across) * frame.plotHeight };
}

function plotRead(frame, x, y) {
  const along = frame.isTall ? (y - frame.top) / frame.plotHeight : (x - frame.left) / frame.plotWidth;
  const across = frame.isTall ? (x - frame.left) / frame.plotWidth : 1 - (y - frame.top) / frame.plotHeight;

  return { frequencyHz: plotFrequency(frame, along), gainDb: clampNumber(across * 2 * rangeDb - rangeDb, -rangeDb, rangeDb) };
}

function plotTrace(frame, valueAt) {
  const points = [];

  for (let index = 0; index <= 120; index += 1) {
    const frequencyHz = plotFrequency(frame, index / 120);
    const point = plotPlace(frame, frequencyHz, valueAt(frequencyHz));
    points.push(`${point.x.toFixed(1)},${point.y.toFixed(1)}`);
  }

  return points;
}

function svgLine(from, to, className) {
  return `<line class="${className}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"/>`;
}

function svgText(point, content, className, anchor) {
  return `<text class="${className}" x="${point.x}" y="${point.y}" text-anchor="${anchor}">${content}</text>`;
}

function drawPlotRegions(frame, options) {
  if (!options.hasRegions) return "";

  return regions.map((region, index) => {
    const start = plotPlace(frame, Math.max(region.lowHz, zooms[frame.zoom][0]), rangeDb);
    const end = plotPlace(frame, Math.min(region.highHz, zooms[frame.zoom][1]), -rangeDb);
    const length = frame.isTall ? end.y - start.y : end.x - start.x;

    if (length <= 0) return "";

    const className = index % 2 ? "plot-region is-alternate" : "plot-region";
    const rect = frame.isTall
      ? `<rect class="${className}" x="${frame.left}" y="${start.y}" width="${frame.plotWidth}" height="${length}"/>`
      : `<rect class="${className}" x="${start.x}" y="${frame.top}" width="${length}" height="${frame.plotHeight}"/>`;

    if (length < 44 || !options.hasLabels) return rect;

    const middle = frame.isTall ? { x: frame.left + frame.plotWidth - 4, y: start.y + length / 2 + 3 } : { x: start.x + length / 2, y: frame.top + 11 };

    return rect + svgText(middle, region.name, "plot-region-label", frame.isTall ? "end" : "middle");
  }).join("");
}

function drawPlotGrid(frame, options) {
  const parts = [];
  let lastLabelAt = -Infinity;

  for (const frequencyHz of ticksHz) {
    const ratio = plotRatio(frame, frequencyHz);

    if (ratio < -0.001 || ratio > 1.001) continue;

    const low = plotPlace(frame, frequencyHz, -rangeDb);
    const high = plotPlace(frame, frequencyHz, rangeDb);
    const labelAt = frame.isTall ? low.y : low.x;

    parts.push(svgLine(low, high, majorTicksHz.includes(frequencyHz) ? "plot-grid is-major" : "plot-grid"));

    if (!options.hasLabels || labelAt - lastLabelAt < 26) continue;

    lastLabelAt = labelAt;
    parts.push(svgText(frame.isTall ? { x: 4, y: low.y + 3 } : { x: low.x, y: frame.height - 5 }, hzLabel(frequencyHz), "plot-label", frame.isTall ? "start" : "middle"));
  }

  for (const gainDb of [-12, -6, 0, 6, 12]) {
    const from = plotPlace(frame, zooms[frame.zoom][0], gainDb);
    const to = plotPlace(frame, zooms[frame.zoom][1], gainDb);

    parts.push(svgLine(from, to, gainDb === 0 ? "plot-grid is-zero" : "plot-grid"));

    if (options.hasLabels) parts.push(svgText(frame.isTall ? { x: from.x, y: 12 } : { x: 4, y: from.y + 3 }, gainDb > 0 ? `+${gainDb}` : `${gainDb}`, "plot-label", frame.isTall ? "middle" : "start"));
  }

  return parts.join("");
}

// Music falls about 3 dB per octave. The tall plot puts that back and mirrors the spectrum at 0 dB.
function drawPlotSpectrum(frame) {
  const points = [];
  const mirrored = [];

  for (let index = 0; index <= 90; index += 1) {
    const frequencyHz = plotFrequency(frame, index / 90);

    if (frame.isTall) {
      const levelDb = spectrumDb(frequencyHz) + 3 * Math.log2(frequencyHz / 1000);
      const halfWidth = clampNumber((levelDb + 60) / 40, 0, 1) * frame.plotWidth * 0.45;
      const center = plotPlace(frame, frequencyHz, 0);
      points.push(`${center.x + halfWidth},${center.y}`);
      mirrored.unshift(`${center.x - halfWidth},${center.y}`);
    } else {
      const level = (spectrumDb(frequencyHz) + 90) / 80;
      points.push(`${frame.left + (index / 90) * frame.plotWidth},${frame.top + frame.plotHeight * (1 - level * 0.8)}`);
    }
  }

  const floor = frame.isTall ? mirrored : [`${frame.left + frame.plotWidth},${frame.top + frame.plotHeight}`, `${frame.left},${frame.top + frame.plotHeight}`];

  return `<polygon class="plot-spectrum" points="${[...points, ...floor].join(" ")}"/>`;
}

function drawPlotLevels(frame, bands) {
  if (bands.length === 0) return "";

  const start = plotPlace(frame, zooms[frame.zoom][0], 0);
  const end = plotPlace(frame, zooms[frame.zoom][1], 0);
  const area = (pick, className) => `<polygon class="${className}" points="${start.x},${start.y} ${plotTrace(frame, (frequencyHz) => pick(sumDb(bands, frequencyHz), 0)).join(" ")} ${end.x},${end.y}"/>`;

  return area(Math.max, "plot-louder") + area(Math.min, "plot-quieter");
}

function drawPlotLayers(frame) {
  if (isEqOff() || sound.soloBand) return "";

  return roles.filter((role) => sound.layers[role] && sound.layers[role].on).map((role) => {
    const bands = sound.layers[role].bands.filter((band) => band.on);
    return `<polyline class="plot-layer tone-${role}" points="${plotTrace(frame, (frequencyHz) => sumDb(bands, frequencyHz)).join(" ")}"/>`;
  }).join("");
}

function drawPlotSelected(frame, plot) {
  const { entry } = readSelected();

  plot.handles = [];

  if (!entry || !plot.options.hasPoints) return "";

  const band = toCurveBand(entry.band);
  const kind = bandKinds[band.type];
  const start = plotPlace(frame, zooms[frame.zoom][0], 0);
  const end = plotPlace(frame, zooms[frame.zoom][1], 0);
  const parts = [`<polygon class="plot-band-area tone-${kind.tone}" points="${start.x},${start.y} ${plotTrace(frame, (frequencyHz) => bandDb(band, frequencyHz)).join(" ")} ${end.x},${end.y}"/>`];

  if (!kind.hasQ) return parts.join("");

  const halfOctaves = octavesFromQ(band.q) / 2;

  for (const side of [-1, 1]) {
    const frequencyHz = band.frequencyHz * 2 ** (side * halfOctaves);
    const handle = plotPlace(frame, frequencyHz, bandDb(band, frequencyHz));

    parts.push(svgLine(plotPlace(frame, frequencyHz, -rangeDb), plotPlace(frame, frequencyHz, rangeDb), `plot-q-line tone-${kind.tone}`));
    parts.push(`<rect class="plot-q-handle tone-${kind.tone}" x="${handle.x - 5}" y="${handle.y - 5}" width="10" height="10" rx="2"/>`);
    plot.handles.push(handle);
  }

  return parts.join("");
}

function drawPlotPoints(frame, plot) {
  plot.nodes = [];

  if (!plot.options.hasPoints) return "";

  return listEntries().map((entry, index) => {
    const kind = bandKinds[entry.band.type];
    const point = plotPlace(frame, entry.band.frequencyHz, kind.hasGain ? entry.band.gainDb : 0);
    const isSelected = entry.band === sound.selectedBand;
    const ring = entry.role === "headphone" ? "" : `<circle class="plot-ring tone-${entry.role}" cx="${point.x}" cy="${point.y}" r="9.5"/>`;
    const chosen = isSelected ? `<circle class="plot-chosen" cx="${point.x}" cy="${point.y}" r="12.5"/>` : "";

    plot.nodes.push({ index, x: point.x, y: point.y });

    return `${chosen}${ring}<circle class="plot-point tone-${kind.tone}${entry.band.on ? "" : " is-off"}" cx="${point.x}" cy="${point.y}" r="7"/>${svgText({ x: point.x, y: point.y + 3 }, index + 1, "plot-number", "middle")}`;
  }).join("");
}

function drawPlotReadout(frame, plot, bands) {
  const { entry } = readSelected();
  const parts = [];

  if (entry && plot.options.hasPoints) {
    const kind = bandKinds[entry.band.type];
    const point = plotPlace(frame, entry.band.frequencyHz, kind.hasGain ? entry.band.gainDb : 0);
    const content = `${hzLabel(entry.band.frequencyHz)} Hz${kind.hasGain ? `  ${signedDb(entry.band.gainDb)} dB` : ""}${kind.hasQ ? `  Q ${entry.band.q.toFixed(2)}` : ""}`;
    const width = content.length * 5.8 + 14;
    const x = clampNumber(point.x - width / 2, 2, frame.width - width - 2);
    const y = point.y > frame.top + 32 ? point.y - 32 : point.y + 17;

    parts.push(`<rect class="plot-pill tone-${kind.tone}" x="${x}" y="${y}" width="${width}" height="17" rx="8.5"/>${svgText({ x: x + width / 2, y: y + 12 }, content, "plot-pill-text", "middle")}`);
  }

  if (plot.hover && !plot.drag) {
    const reading = plotRead(frame, plot.hover.x, plot.hover.y);
    const valueDb = sumDb(bands, reading.frequencyHz);
    const dot = plotPlace(frame, reading.frequencyHz, valueDb);
    const content = `${hzLabel(reading.frequencyHz)} Hz  ${signedDb(valueDb)} dB`;
    const width = content.length * 5.8 + 12;
    const x = frame.left + frame.plotWidth - width;
    const y = frame.top + (frame.isTall ? 2 : 18);

    parts.push(svgLine(plotPlace(frame, reading.frequencyHz, -rangeDb), plotPlace(frame, reading.frequencyHz, rangeDb), "plot-hover"));
    parts.push(`<circle class="plot-hover-dot" cx="${dot.x}" cy="${dot.y}" r="3"/><rect class="plot-readout" x="${x}" y="${y}" width="${width}" height="16" rx="4"/>${svgText({ x: x + 6, y: y + 11.5 }, content, "plot-pill-text", "start")}`);
  }

  return parts.join("");
}

function renderPlot(host, view) {
  const options = readPlotOptions(view, host.dataset.region);
  const plot = host.plot || (host.plot = { hover: null, drag: null, nodes: [], handles: [] });

  plot.options = options;

  const frame = measurePlot(host, options);
  const bands = listHeardBands();
  const clipId = host.dataset.clip || (host.dataset.clip = `plot-clip-${(plotCount += 1)}`);
  const curve = `<polyline class="plot-curve${isEqOff() ? " is-off" : ""}" points="${plotTrace(frame, (frequencyHz) => sumDb(bands, frequencyHz)).join(" ")}"/>`;
  const clipped = `${drawPlotSpectrum(frame)}${drawPlotLevels(frame, bands)}${drawPlotSelected(frame, plot)}${drawPlotLayers(frame)}${curve}`;

  plot.frame = frame;
  host.classList.toggle("is-interactive", options.isInteractive);
  host.innerHTML = `<svg class="ui-plot__svg" viewBox="0 0 ${frame.width} ${frame.height}" height="${frame.height}" role="img" aria-label="The EQ curve"><defs><clipPath id="${clipId}"><rect x="${frame.left}" y="${frame.top}" width="${frame.plotWidth}" height="${frame.plotHeight}"/></clipPath></defs>${drawPlotRegions(frame, options)}${drawPlotGrid(frame, options)}<g clip-path="url(#${clipId})">${clipped}</g>${drawPlotPoints(frame, plot)}${drawPlotReadout(frame, plot, bands)}</svg>`;
}

function readPlotPointer(host, event) {
  const bounds = host.getBoundingClientRect();
  const { frame } = host.plot;

  return { x: (event.clientX - bounds.left) * (frame.width / bounds.width), y: (event.clientY - bounds.top) * (frame.height / bounds.height) };
}

function hitPlot(plot, point) {
  const isNear = (item, radiusPx) => Math.hypot(item.x - point.x, item.y - point.y) < radiusPx;

  if (plot.handles.some((handle) => isNear(handle, 12))) return { kind: "width", index: readSelected().index };

  const node = [...plot.nodes].reverse().find((item) => isNear(item, 14));

  return node ? { kind: "move", index: node.index } : null;
}

function dragBand(plot, band, point, isFine) {
  const { frame, drag } = plot;
  const kind = bandKinds[band.type];

  if (drag.kind === "width") {
    if (!kind.hasQ) return;
    const reading = plotRead(frame, point.x, point.y);
    band.q = clampNumber(qFromOctaves(Math.max(2 * Math.abs(Math.log2(reading.frequencyHz / band.frequencyHz)), 0.05)), ...bandQRange);
    return;
  }

  const scale = isFine ? 0.25 : 1;
  const start = plotPlace(frame, drag.startHz, drag.startDb);
  const target = plotRead(frame, start.x + (point.x - drag.startX) * scale, start.y + (point.y - drag.startY) * scale);

  band.frequencyHz = Math.round(target.frequencyHz);

  if (kind.hasGain) band.gainDb = Math.round(target.gainDb * 10) / 10;
}

function wirePlot(host, view) {
  host.addEventListener("pointerdown", (event) => {
    if (!host.plot.options.isInteractive) return;

    const point = readPlotPointer(host, event);
    const target = hitPlot(host.plot, point);

    if (!target) return;

    const { band } = listEntries()[target.index];
    const startDb = bandKinds[band.type].hasGain ? band.gainDb : 0;

    sound.selectedBand = band;
    host.plot.drag = { ...target, startX: point.x, startY: point.y, startHz: band.frequencyHz, startDb, isMoving: target.kind === "width" };
    host.setPointerCapture(event.pointerId);
    commit();
  });
  host.addEventListener("pointermove", (event) => {
    const { plot } = host;

    if (!plot || !plot.options.isInteractive) return;

    const point = readPlotPointer(host, event);

    plot.hover = point;

    if (!plot.drag) {
      renderPlot(host, view);
      return;
    }

    const entry = listEntries()[plot.drag.index];
    const movedPx = Math.hypot(point.x - plot.drag.startX, point.y - plot.drag.startY);

    if (!entry || (!plot.drag.isMoving && movedPx < dragStartPx)) return;

    plot.drag.isMoving = true;
    dragBand(plot, entry.band, point, event.shiftKey);
    markEdited(entry.role);
    commit();
  });

  for (const type of ["pointerup", "pointercancel"]) {
    host.addEventListener(type, () => {
      if (!host.plot) return;
      host.plot.drag = null;
      renderPlot(host, view);
    });
  }

  host.addEventListener("pointerleave", () => {
    if (!host.plot || host.plot.drag) return;
    host.plot.hover = null;
    renderPlot(host, view);
  });
  // A double click joins the layer of the chosen band, or the headphone layer when no band is chosen.
  host.addEventListener("dblclick", (event) => {
    if (!host.plot.options.isInteractive) return;

    const point = readPlotPointer(host, event);

    if (hitPlot(host.plot, point)) return;

    const reading = plotRead(host.plot.frame, point.x, point.y);
    const { entry } = readSelected();

    addBand(entry ? entry.role : "headphone", reading.frequencyHz, reading.gainDb);
  });
  host.addEventListener("wheel", (event) => {
    if (!host.plot.options.isInteractive) return;

    const target = hitPlot(host.plot, readPlotPointer(host, event));
    const entry = target && listEntries()[target.index];

    if (!entry || !bandKinds[entry.band.type].hasQ) return;

    event.preventDefault();
    entry.band.q = clampNumber(entry.band.q * qStepRatio ** (event.deltaY < 0 ? 1 : -1), ...bandQRange);
    sound.selectedBand = entry.band;
    markEdited(entry.role);
    commit();
  }, { passive: false });
}

// The primitive gallery. Each card shows one primitive and its variants, live, from the same builders.
const gallery = { isSwitchOn: true, tab: "tune", innerTab: "ear", zoom: "mids", type: "PK", bassDb: 2, preampDb: -6.4, isAuto: true, chip: 2, stepHz: 1000, isDrawerOpen: true, isTableOpen: false, isSolo: true, isHeld: false, pick: "Sennheiser HD 600", layerOn: true };

function holdGalleryButton(isHeld) {
  if (gallery.isHeld === isHeld) return;

  gallery.isHeld = isHeld;
  renderGallery();
}

const primitiveCards = [
  {
    name: "Button",
    note: "Every press. One element, five looks, two sizes, and three states: on for a toggle, held for A/B, and off.",
    usedBy: "A/B, help, Change, ×, Auto, Tall, On, Solo, Delete, Save, Save as new, Import, Paste, Export, Apply, the guide and site links",
    demo: () => `<div class="ui-cluster">${ui.button({ label: "Change" })}${ui.button({ variant: "primary", label: "Save" })}${ui.button({ variant: "quiet", label: "Credits" })}${ui.button({ variant: "danger", label: "Delete" })}</div>
      <div class="ui-cluster">${ui.button({ size: "small", label: "Solo", isOn: gallery.isSolo, act: "solo" })}${ui.button({ variant: "hold", label: "A/B", isHeld: gallery.isHeld, extra: 'data-hold="gallery"', title: "Hold me" })}${ui.button({ size: "small", icon: "power", label: "ON", isOn: true, tone: "good" })}${ui.button({ variant: "quiet", icon: "close", title: "Delete" })}${ui.button({ size: "small", label: "Save changes", isDisabled: true })}</div>
      ${ui.button({ variant: "primary", isWide: true, label: "Open the full guide" })}`,
  },
  {
    name: "Switch",
    note: "On or off, nothing else. The EQ, each layer and Level match.",
    usedBy: "the header switch, the three layer rows, Level match",
    demo: () => `<div class="ui-cluster">${ui.switch({ isOn: gallery.isSwitchOn, act: "switch", title: "Try it" })}<span class="ui-text-hint">${gallery.isSwitchOn ? "On" : "Off"}</span>${ui.switch({ isOn: false, isDisabled: true, title: "Off and disabled" })}</div>`,
  },
  {
    name: "List row",
    note: "A pressable item: a name, a detail line, a badge, and actions at the end. Selected means it plays now.",
    usedBy: "presets, AutoEQ results, starter sounds, Sets, the number table, the Mac menu",
    demo: () => {
      const remove = ui.button({ variant: "quiet", size: "small", icon: "close", title: "Delete" });
      const rows = [
        ui.listRow({ name: "Sennheiser HD 600", badge: ui.badge({ label: "AutoEQ's pick", tone: "good" }), detail: "oratory1990 · Over-ear · GRAS 43AG-7 · Harman over-ear 2018", act: "pick", value: "Sennheiser HD 600", isSelected: gallery.pick === "Sennheiser HD 600" }),
        ui.listRow({ name: "Ear test, 3 Sep", detail: "2 bands", act: "pick", value: "Ear test, 3 Sep", isSelected: gallery.pick === "Ear test, 3 Sep", trail: remove }),
        ui.listRow({ name: "No ear tuning", detail: "Headphone only", isMuted: true }),
      ];
      const menu = `<div class="pn-menu">${ui.listRow({ variant: "dense", name: "HD 600 home", lead: `<span class="pn-menu__tick">${iconHtml("check")}</span>`, isSelected: true })}${ui.listRow({ variant: "dense", name: "Restart engine", lead: '<span class="pn-menu__tick"></span>' })}</div>`;
      const table = ui.listRow({ variant: "columns", isHead: true, cells: ["Band", "Hz", "dB", "Q"] }) + ui.listRow({ variant: "columns", cells: [`${ui.badge({ kind: "step", label: 5, tone: "peak" })}<span>Peak</span>`, "5617", "+6.0", "2.71"], act: "pick", value: "table", isSelected: gallery.pick === "table" });
      return `<div class="ui-stack ui-stack--tight">${rows.join("")}</div><div class="doc-variants"><span class="doc-variant">dense</span>${menu}<span class="doc-variant">columns</span>${table}</div>`;
    },
  },
  {
    name: "Stack row",
    note: "A row that holds a control: a coloured bar for its layer, a switch in front, a caption and a name, a slot under the name, and actions.",
    usedBy: "the three layers, the Set picker, the current sound in the Library, Level match, the guide's chain, the store tile",
    demo: () => {
      const toggle = ui.switch({ isOn: gallery.layerOn, act: "layer", title: "My ear on or off" });
      const actions = ui.button({ variant: "quiet", size: "small", label: "Change" }) + ui.button({ variant: "quiet", size: "small", icon: "close", title: "Take it off" });
      const target = `<span class="pn-target">${ui.field({ kind: "select", label: "Target", amount: "Harman over-ear 2018", options: targetSets["GRAS 43AG-7"].map((name) => [name, name]) })}</span>`;
      return `<div class="ui-stack ui-stack--chain">
        ${ui.stackRow({ tone: "headphone", lead: ui.switch({ isOn: true, title: "Headphone" }), caption: "Headphone · AutoEQ", name: "AKG N700NC M2", extra: target, trail: actions })}
        ${ui.stackRow({ tone: "ear", isOff: !gallery.layerOn, lead: toggle, caption: "My ear · Saved", name: "Ear test, 12 Oct", trail: actions })}
        ${ui.stackRow({ tone: "taste", isEmpty: true, caption: "Taste", name: "Not added", trail: ui.button({ size: "small", icon: "plus", label: "Add your taste" }) })}
      </div>`;
    },
  },
  {
    name: "Section header",
    note: "Names a group. Eyebrow for a list, section with a step for a Library tab or a band, title for a screen, column for the wide panel.",
    usedBy: "every group heading, the inspector title, the Library steps, Get started, the wide columns",
    demo: () => `${ui.sectionHeader({ label: "AutoEQ headphones", count: 3 })}
      ${ui.sectionHeader({ variant: "section", step: 2, tone: "ear", label: "My ear", caption: "Tunes the sound to your own hearing, on top of the headphone." })}
      ${ui.sectionHeader({ variant: "section", step: 5, tone: "peak", label: "Peak", caption: "Headphone layer", trail: ui.button({ size: "small", label: "Solo" }) })}
      ${ui.sectionHeader({ variant: "title", label: "Get started", caption: "Different ear, different head, different sound." })}`,
  },
  {
    name: "Tabs",
    note: "Moves between places. Large for the panel, small inside the Library. One controller for both.",
    usedBy: "Listen, Tune and Library, the four Library tabs",
    demo: () => `${ui.tabs({ items: [["listen", "Listen"], ["tune", "Tune"], ["library", "Library"]], current: gallery.tab, act: "tab" })}${ui.tabs({ items: libraryTabItems, current: gallery.innerTab, act: "inner-tab", size: "small" })}`,
  },
  {
    name: "Segmented",
    note: "Picks one value of a few. A pill for the zoom, a grid when the labels are long.",
    usedBy: "the zoom, the band type with More",
    demo: () => `${ui.segmented({ items: [["all", "All"], ["lows", "Lows"], ["mids", "Mids"], ["highs", "Highs"]], current: gallery.zoom, act: "zoom" })}${ui.segmented({ variant: "grid", items: [...commonTypes.map((type) => [type, bandKinds[type].label]), ["more", "More"]], current: gallery.type, act: "type" })}`,
  },
  {
    name: "Slider row",
    note: "A label and its hint, the rail, the value, and an optional action. A dB rail fills from 0 dB.",
    usedBy: "Bass, Vocals, Treble, Preamp with Auto",
    demo: () => `${ui.sliderRow({ label: "Bass", hint: "Below 120 Hz", amount: gallery.bassDb, min: -6, max: 6, step: 0.5, act: "bass" })}${ui.sliderRow({ label: "Preamp", hint: gallery.isAuto ? "Auto" : "Manual", amount: gallery.preampDb, min: -24, max: 12, step: 0.1, act: "preamp", trail: ui.button({ size: "small", label: "Auto", isOn: gallery.isAuto, act: "auto" }) })}`,
  },
  {
    name: "Chip",
    note: "A small pressable token. A band, with its number in its type colour, an add chip, or a tag.",
    usedBy: "the band chips and Add band, the tabs in the guide pictures",
    demo: () => {
      const chips = [[1, "105", "shelf"], [2, "250", "peak"], [3, "4.5k", "peak"], [4, "90", "cut"]].map(([number, label, tone]) => ui.chip({ number, label, tone, act: "chip", value: number, isOn: gallery.chip === number, isMuted: number === 4 }));
      return `<div class="ui-cluster">${chips.join("")}${ui.chip({ variant: "add", icon: "plus", label: "Add band" })}</div><div class="ui-cluster">${ui.chip({ variant: "tag", icon: "speaker", label: "Lofi radio", isOn: true })}${ui.chip({ variant: "tag", label: "Mail" })}</div>`;
    },
  },
  {
    name: "Field",
    note: "Anything you type or pick. Text, search, select with a prefix, the stepper, the paste box and read-only code.",
    usedBy: "the search, the save name, Target, the rare types, the Set picker, frequency, gain and Q, Paste, Export, the install line",
    demo: () => `${ui.field({ kind: "search", placeholder: "Search AutoEQ or your presets" })}
      ${ui.field({ kind: "select", label: "Target", amount: "Harman over-ear 2018", options: targetSets["GRAS 43AG-7"].map((name) => [name, name]) })}
      <div class="ui-grid" style="--columns:2">${ui.field({ kind: "stepper", amount: gallery.stepHz, unit: "Hz", steps: "step", key: "frequency", stepTitles: ["One semitone lower", "One semitone higher"] })}${ui.field({ kind: "text", placeholder: "Name for this ear preset" })}</div>
      ${ui.field({ kind: "code", amount: 'goui set "HD 600 home"' })}`,
  },
  {
    name: "Expander",
    note: "Opens a small panel under the control that owns it. A drawer under a toggle, or a disclosure with its own summary.",
    usedBy: "Save name, Paste, Export, Export the whole sound, Save as Set, the number table",
    demo: () => `${ui.button({ size: "small", label: "Paste", isOn: gallery.isDrawerOpen, act: "drawer" })}${ui.expander({ isOpen: gallery.isDrawerOpen, body: `${ui.field({ kind: "area", amount: earText, rows: 3 })}<div class="ui-split"><span class="ui-text-fine">One ParametricEQ.txt, as text</span>${ui.button({ variant: "primary", size: "small", label: "Apply" })}</div>` })}${ui.expander({ variant: "disclosure", summary: "Number table", count: 11, isOpen: gallery.isTableOpen, act: "table", body: '<p class="ui-text-hint">The rows are list rows, in columns.</p>' })}`,
  },
  {
    name: "Badge",
    note: "A mark of state that you read, never press. A pill, a dot with a value, a step number, and a legend key.",
    usedBy: "AutoEQ's pick, Proposed, the level and clip light, the Library steps, band numbers, the graph legend",
    demo: () => `<div class="ui-cluster">${ui.badge({ label: "AutoEQ's pick", tone: "good" })}${ui.badge({ label: "Proposed", tone: "accent" })}${ui.badge({ label: "Edited" })}${ui.badge({ label: "Can clip", tone: "danger" })}</div>
      <div class="ui-cluster">${ui.badge({ kind: "dot", tone: "good", label: "-14.2 dB" })}${ui.badge({ kind: "dot", tone: "danger", label: "-2.1 dB" })}${ui.badge({ kind: "step", label: 1, tone: "headphone" })}${ui.badge({ kind: "step", label: 2, tone: "ear" })}${ui.badge({ kind: "step", label: 3, tone: "taste" })}</div>
      <div class="ui-cluster ui-cluster--legend">${legendKeys.slice(0, 5).map(([key, tone, label]) => ui.badge({ kind: "key", key, tone, label })).join("")}</div>`,
  },
];

const galleryClicks = {
  solo: () => { gallery.isSolo = !gallery.isSolo; },
  switch: () => { gallery.isSwitchOn = !gallery.isSwitchOn; },
  layer: () => { gallery.layerOn = !gallery.layerOn; },
  pick: (value) => { gallery.pick = value; },
  tab: (value) => { gallery.tab = value; },
  "inner-tab": (value) => { gallery.innerTab = value; },
  zoom: (value) => { gallery.zoom = value; },
  type: (value) => { gallery.type = value; },
  auto: () => { gallery.isAuto = !gallery.isAuto; },
  chip: (value) => { gallery.chip = Number(value); },
  step: (value) => { gallery.stepHz = Math.round(clampNumber(gallery.stepHz * 2 ** (Number(value.split(":")[1]) / 12), 20, 20_000)); },
  drawer: () => { gallery.isDrawerOpen = !gallery.isDrawerOpen; },
  table: () => { gallery.isTableOpen = !gallery.isTableOpen; },
};

function renderGallery() {
  const host = byId("primitive-grid");
  const cards = primitiveCards.map((card, index) => `<article class="doc-card" data-card="${index}"><header class="doc-card__head"><span class="doc-card__index">${String(index + 1).padStart(2, "0")}</span><h3>${card.name}</h3></header><p class="doc-card__note">${card.note}</p><div class="doc-card__demo">${card.demo()}</div><p class="doc-card__used"><b>Composes into</b> ${card.usedBy}</p></article>`);

  if (isTypingIn(host)) return;

  host.innerHTML = cards.join("");
}

function wireGallery() {
  const host = byId("primitive-grid");

  host.addEventListener("click", (event) => {
    const target = event.target.closest("[data-act]");
    const action = target && galleryClicks[target.dataset.act];

    if (!action || target.matches("input")) return;

    action(target.dataset.value);
    renderGallery();
  });
  host.addEventListener("input", (event) => {
    const key = event.target.dataset.act;

    if (key !== "bass" && key !== "preamp") return;

    const valueDb = Number(event.target.value);
    const min = Number(event.target.min);
    const max = Number(event.target.max);
    const share = (number) => ((number - min) / (max - min)) * 100;

    if (key === "bass") gallery.bassDb = valueDb;
    else Object.assign(gallery, { preampDb: valueDb, isAuto: false });

    event.target.setAttribute("style", readSliderFill(share(0), share(valueDb)));
    event.target.nextElementSibling.textContent = `${signedDb(valueDb)} dB`;
  });
  host.addEventListener("change", renderGallery);
}

// The tokens, read back from the CSS, so the page shows what the stylesheet holds.
const tokenGroups = [
  { title: "Ink", note: "The page, the panel and three raised steps. Depth comes from these, never from a shadow.", tokens: ["--ink-0", "--ink-1", "--ink-2", "--ink-3", "--ink-4"] },
  { title: "Line and text", note: "Two hairlines and three text steps.", tokens: ["--line-1", "--line-2", "--text-1", "--text-2", "--text-3"] },
  { title: "Brand", note: "The accent and what follows it. The picker below sets the first one.", tokens: ["--accent", "--accent-ink", "--accent-soft", "--accent-line"] },
  { title: "Meaning", note: "Good and danger. Never a band or a layer.", tokens: ["--good", "--danger"] },
  { title: "Band type", note: "The colour of a band's number, point and area.", tokens: ["--type-peak", "--type-shelf", "--type-cut"] },
  { title: "Layer", note: "The colour of a layer's bar, ring and dashed curve.", tokens: ["--layer-headphone", "--layer-ear", "--layer-taste"] },
  { title: "Level", note: "The fills under the curve and the live spectrum.", tokens: ["--level-louder", "--level-quieter", "--spectrum"] },
];

function readToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function renderTokens() {
  byId("token-palette").innerHTML = tokenGroups.map((group) => {
    const items = group.tokens.map((name) => {
      const value = readToken(name);
      const shown = value.startsWith("color-mix") ? "from the accent" : value;
      return `<div class="doc-token"><span class="doc-token__fill" style="background:var(${name})"></span><code>${name}</code><small>${shown}</small></div>`;
    });
    return `<div class="doc-token-group"><h4>${group.title}</h4><p>${group.note}</p>${items.join("")}</div>`;
  }).join("");
}

const typeScale = [
  ["--size-micro", "10", "Eyebrow, badge", "AUTOEQ HEADPHONES"],
  ["--size-small", "11", "Caption, detail, hint", "oratory1990 · Over-ear · GRAS 43AG-7"],
  ["--size-body", "12", "Body, controls", "Tap a point or a chip to tune that band."],
  ["--size-name", "14", "A name, a tab", "Sennheiser HD 600"],
  ["--size-title", "18", "A screen title", "Get started"],
  ["--size-display", "30", "A big number", "-6.4 dB"],
  ["--size-hero", "56", "The site and the tile", "Different ear."],
];

const spaceScale = ["--space-1", "--space-2", "--space-3", "--space-4", "--space-5", "--space-6", "--space-7"];
const radiusScale = [["--radius-1", "a mark, a chip number"], ["--radius-2", "a control, a field, a row"], ["--radius-3", "a frame, a card"], ["--radius-pill", "a switch, a chip, a pill"]];

const stateExamples = [
  ["Rest", "", ""],
  ["Hover", "is-hover", "The fill rises one ink step."],
  ["Focus", "is-focus", "A 2 px accent ring, 2 px out."],
  ["On", "is-on", "A pressed toggle. Accent tint, accent text."],
  ["Current", "is-current", "The tab or value you are on. White on ink."],
  ["Selected", "is-selected", "What plays now. Accent bar and tint."],
  ["Held", "is-held", "Only while pressed. White, the EQ is off."],
  ["Muted", "is-muted", "Off, but still yours. 45% opacity."],
  ["Disabled", "is-disabled", "Nothing to do. 35% opacity."],
];

function buildStateExample([label, className, note]) {
  const button = `<button type="button" class="ui-button ui-button--plain ui-button--small ${className}">Solo</button>`;
  const row = ui.listRow({ name: "HD 600 home", detail: "3 presets", act: "none" }).replace('class="ui-list-row"', `class="ui-list-row ${className}"`);
  const segment = `<div class="ui-segmented"><button type="button" class="ui-segmented__item ${className}">Mids</button></div>`;

  return `<div class="doc-state"><h4>${label}</h4><div class="ui-cluster">${button}${segment}</div>${row}<p>${note || "Every control starts here."}</p></div>`;
}

function renderScales() {
  byId("type-scale").innerHTML = typeScale.map(([name, size, use, sample]) => {
    const isNumber = name === "--size-display";
    return `<div class="doc-type"><code>${name}</code><small>${size} px · ${use}</small><span class="doc-type__sample${isNumber ? " is-number" : ""}" style="font-size:var(${name})">${sample}</span></div>`;
  }).join("");
  byId("space-scale").innerHTML = spaceScale.map((name) => `<div class="doc-space"><code>${name}</code><small>${readToken(name)}</small><span style="width:var(${name})"></span></div>`).join("");
  byId("radius-scale").innerHTML = radiusScale.map(([name, use]) => `<div class="doc-radius"><span style="border-radius:var(${name})"></span><code>${name}</code><small>${readToken(name)} · ${use}</small></div>`).join("");
  byId("state-grid").innerHTML = stateExamples.map(buildStateExample).join("");
}

// The accent. A choice is checked against every audio colour, so a band or a layer never reads as the brand.
const accentChoices = [
  { name: "Acid", value: "#d4ff3f" },
  { name: "Bone", value: "#ece4d0" },
  { name: "Cobalt", value: "#3d5bff" },
];
const accentCheckedTokens = [["--type-peak", "Peak"], ["--type-shelf", "Shelf"], ["--type-cut", "Cut"], ["--layer-headphone", "Headphone"], ["--layer-ear", "My ear"], ["--layer-taste", "Taste"], ["--good", "Good"], ["--danger", "Danger"]];
const minAccentDistance = 0.1;

// OKLab from linear sRGB, after https://bottosson.github.io/posts/oklab/
function toOklab(hex) {
  const linear = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255).map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  const [red, green, blue] = linear;
  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const middle = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);

  return [0.2104542553 * long + 0.793617785 * middle - 0.0040720468 * short, 1.9779984951 * long - 2.428592205 * middle + 0.4505937099 * short, 0.0259040371 * long + 0.7827717662 * middle - 0.808675766 * short];
}

function readColorDistance(firstHex, secondHex) {
  const first = toOklab(firstHex);
  const second = toOklab(secondHex);

  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

function setAccent(hex) {
  const isLight = toOklab(hex)[0] > 0.62;

  accentColor = hex;
  document.documentElement.style.setProperty("--accent", hex);
  document.documentElement.style.setProperty("--accent-ink", isLight ? "#0b0c0e" : "#ffffff");
  renderAccentPicker();
  renderTokens();

  for (const graph of graphs) graph.render();
}

function renderAccentPicker() {
  const swatches = accentChoices.map((choice) => `<button type="button" class="doc-accent${choice.value === accentColor ? " is-current" : ""}" data-accent="${choice.value}"><span style="background:${choice.value}"></span>${choice.name}</button>`);
  const isCustom = !accentChoices.some((choice) => choice.value === accentColor);
  const custom = `<label class="doc-accent${isCustom ? " is-current" : ""}"><input type="color" value="${accentColor}" data-accent-input aria-label="Any colour" />Any colour</label>`;
  const checks = accentCheckedTokens.map(([name, label]) => {
    const distance = readColorDistance(accentColor, readToken(name));
    const isClear = distance >= minAccentDistance;
    return `<div class="doc-check${isClear ? "" : " is-close"}"><span class="doc-check__pair"><i style="background:var(--accent)"></i><i style="background:var(${name})"></i></span><span>${label}</span><code>${distance.toFixed(2)}</code>${ui.badge({ label: isClear ? "Apart" : "Too close", tone: isClear ? "good" : "danger" })}</div>`;
  });
  const closeCount = accentCheckedTokens.filter(([name]) => readColorDistance(accentColor, readToken(name)) < minAccentDistance).length;
  const verdict = closeCount === 0 ? "Every audio colour reads apart from this accent." : `${closeCount} audio ${closeCount === 1 ? "colour reads" : "colours read"} like the accent. Pick another accent. The audio colours do not move.`;

  byId("accent-picker").innerHTML = `<div class="ui-cluster">${swatches.join("")}${custom}</div>`;
  byId("accent-check").innerHTML = `<p class="ui-text-hint${closeCount ? " tone-danger" : ""}">${verdict} The distance is in OKLab, and below ${minAccentDistance} reads as the same colour.</p><div class="doc-check-grid">${checks.join("")}</div>`;
}

function wireAccentPicker() {
  byId("accent-picker").addEventListener("click", (event) => {
    const button = event.target.closest("[data-accent]");
    if (button) setAccent(button.dataset.accent);
  });
  byId("accent-picker").addEventListener("input", (event) => {
    if (event.target.matches("[data-accent-input]")) setAccent(event.target.value);
  });
}

const mappingRows = [
  [".head .row, .brand", "panel.html", "Header block", "two ui-split rows, no own control"],
  ["#help.small", "panel.html", "Button", "quiet, small"],
  ["#compare.hold, .hold.on", "panel.html, sound.js", "Button", "hold, held while pressed"],
  ["#power.power[aria-pressed]", "panel.html", "Button", "small, icon power, on, tone good"],
  ["label.switch .track (header, layers, Level match)", "panel.css, listen.js", "Switch", "one control"],
  ["#status.source, .source.instruction", "panel.html", "Header block text", "the instruction state"],
  [".meter, .dot, .dot.red", "panel.html, listen.js", "Badge", "dot, tone good or danger"],
  ["nav.tabs#tabs", "panel.html", "Tabs", "large"],
  [".tabs.library-tabs", "panel.html", "Tabs", "small"],
  ["showTab, showLibrarySection", "dom.js, library.js", "Tabs", "one controller for both"],
  [".card", "panel.css", "Section header + ui-stack", "no box, an eyebrow names the group"],
  [".column-title", "panel.html", "Section header", "column"],
  [".layer, .layer.off, .layer-mark", "listen.js", "Stack row", "tone per layer, off"],
  [".layer .target select", "listen.js", "Field", "select with the prefix Target, in the row's slot"],
  [".add-layers button", "listen.js", "Stack row", "empty, with a Button"],
  [".change, the × of a layer", "listen.js", "Button", "quiet, small, icon close"],
  [".slider", "panel.html", "Slider row", "fills from 0 dB"],
  [".slider.preamp, #autoPreamp", "panel.html", "Slider row + Button", "trail slot, Button on"],
  [".slider.level-match", "panel.html", "Stack row", "a Switch in front, no bar"],
  [".pills, #tall", "panel.html", "Segmented + Button", "pill, and a toggle beside it"],
  [".segments, .segments .more, #bandType", "panel.html, tune.js", "Segmented + Field", "grid with More, then a select"],
  [".chips .chip-row .chip-label", "tune.js", "Section header + ui-cluster", "eyebrow in the layer tone"],
  [".chip, .chip.muted, .chip.add", "tune.js", "Chip", "band, muted, add"],
  ["#bandTitle and On, Solo, Delete", "panel.html, tune.js", "Section header + Button", "section with a step, trail of toggles and danger"],
  [".stepper", "panel.html", "Field", "stepper, made of two Buttons"],
  ["details.card summary, .band-table", "panel.html, tune.js", "Expander + List row", "disclosure, columns"],
  [".legend .swatch", "panel.html", "Badge", "key"],
  [".preset-section .section-head .step", "panel.html", "Section header + Badge", "section, step"],
  [".current, .current-caption, .current-name", "panel.html, presets.js", "Stack row", "tone per layer"],
  [".save, .save-as", "panel.html", "Button", "primary, plain"],
  [".save-row, .save-name, .confirm-save", "panel.html, library.js", "Expander + Field + Button", "drawer"],
  [".library-actions button, button.on", "panel.html, library.js", "Button", "small, on"],
  [".drawer textarea.text, .apply", "panel.html", "Expander + Field + Button", "drawer, area, primary"],
  ["#exportAll, #wholeText", "panel.html, listen.js", "Button + Expander + Field", "wide, on, area read-only"],
  ["#eqbyear", "panel.html", "Button", "wide, icon external"],
  ["input.search", "panel.html", "Field", "search"],
  [".results h4", "items.js", "Section header", "eyebrow with a count"],
  [".item, .item.on, .item.measurement", "items.js, headphones.js", "List row", "selected, detail line"],
  [".pick", "headphones.js", "Badge", "pill, tone good"],
  [".result-row .remove", "items.js", "List row + Button", "trail slot, quiet icon close"],
  [".hint, .action-hint, .search-hint", "panel.css", "ui-text-hint", "a text style, tone danger for a warning"],
  [".credits", "panel.html", "ui-text-fine + Button", "quiet, small"],
  [".start, .guide-steps, .guide-text", "panel.html, guide.css", "Section header + Field + Badge", "section with a step, the pictures from primitives"],
  ["button.small, .wide", "panel.css", "Button", "small, wide"],
  ["buildLayerRow, buildResultItem, appendSection", "listen.js, items.js", "buildStackRow, buildListRow, buildSectionHeader", "the builders of the code pass"],
];

function renderMapping() {
  const rows = mappingRows.map(([today, where, primitive, variant]) => `<tr><td><code>${escapeHtml(today)}</code></td><td>${where}</td><td><b>${primitive}</b></td><td>${variant}</td></tr>`);
  byId("mapping-table").innerHTML = `<thead><tr><th>Today</th><th>Where</th><th>Primitive</th><th>Variant or slot</th></tr></thead><tbody>${rows.join("")}</tbody>`;
}

const guideChain = [
  ["", "The tab you hear", "Lofi radio · radio.example.com"],
  ["headphone", "1 · Headphone", "AutoEQ makes your headphone neutral"],
  ["ear", "2 · My ear", "EQByEar tunes it to your own hearing"],
  ["taste", "3 · Taste", "Your own flavour goes on top"],
];

const guideSections = [["how", "How it works"], ["install", "Start"], ["switch", "The icon is the switch"], ["ear", "Measure your ear"], ["credits", "Credits"]];

function renderGuide(sectionKey = "how") {
  const nav = guideSections.map(([key, label]) => ui.listRow({ variant: "dense", name: label, act: "guide", value: key, isSelected: key === sectionKey }));
  const chain = guideChain.map(([tone, caption, name]) => ui.stackRow({ tone, caption: escapeHtml(caption), name: escapeHtml(name) })).join("");
  const steps = [...startSteps, ["tune", "Tune it", "Pick your headphone in the Library, then measure your ear and add your taste."]].map(([key, title, text], index) => `<div class="pn-step">${ui.sectionHeader({ variant: "section", step: index + 1, tone: "accent", label: title, caption: text })}${key === "tune" ? ui.button({ size: "small", label: "Open the Library" }) : buildShot(key)}</div>`);
  const switchFacts = [
    ["With the panel open, click the icon on the tab goui hears to turn goui off.", ""],
    ["Click the icon on another tab to move goui there.", ""],
    ["An installed app has no side panel, so the icon opens goui as a popup, with its own power button.", "Popup"],
    ["Closing the tab goui hears turns goui off.", ""],
    ["The extension changes the sound of one browser tab. For every sound on the Mac, use goui for the Mac.", "Mac"],
  ].map(([text, badge]) => `<li>${badge ? ui.badge({ label: badge, tone: "accent" }) : ""}${text}</li>`);
  const earSteps = [
    ["Turn My ear off", "In the Library, press Measure my ear with EQByEar. My ear turns off, so the test hears the headphone alone."],
    ["Run the test", "EQByEar opens in a new tab. Click the goui icon on that tab, then run the test."],
    ["Paste the result", "Copy the result, come back, and Paste it into My ear."],
    ["Save it", "Press Save, then turn My ear on to hear the headphone plus your ear."],
  ].map(([label, caption], index) => ui.sectionHeader({ variant: "section", step: index + 1, tone: "ear", label, caption }));
  const credits = [
    ["AutoEQ by Jaakko Pasanen", "The headphone profiles, the search index and the targets · MIT licence"],
    ["EQByEar", "The ear test at eqbyear.com"],
    ["Google Material Icons", "The icons of the panel and the guide · Apache 2.0"],
    ["goui", "MIT licence"],
  ].map(([name, detail]) => ui.listRow({ name, detail }));
  const links = `${ui.button({ icon: "external", label: "AutoEQ", href: "https://github.com/jaakkopasanen/AutoEq" })}${ui.button({ icon: "external", label: "EQByEar", href: "https://eqbyear.com" })}`;

  byId("screen-guide").innerHTML = `<div class="pn-guide">
    <nav class="pn-guide__nav">${ui.sectionHeader({ label: "On this page" })}<div class="pn-menu">${nav.join("")}</div></nav>
    <article class="pn-guide__body">
      <section data-guide="how" class="ui-stack ui-stack--loose">${ui.sectionHeader({ label: "How to use goui" })}<h3 class="pn-hero__title">Different ear, different head, different sound.</h3><p class="pn-hero__lede">goui keeps three layers apart. The sound of a tab passes the headphone layer, then your ear, then your taste, then reaches you. The bands of all three add up in dB, so the merge is exact.</p><div class="ui-stack ui-stack--chain">${chain}${ui.stackRow({ tone: "accent", caption: "You", name: "Hear it" })}</div></section>
      <section data-guide="install" class="ui-stack ui-stack--loose">${ui.sectionHeader({ label: "Start" })}<div class="pn-guide__steps">${steps.join("")}</div></section>
      <section data-guide="switch" class="ui-stack">${ui.sectionHeader({ label: "The icon is the switch" })}<ul class="pn-facts">${switchFacts.join("")}</ul></section>
      <section data-guide="ear" class="ui-stack">${ui.sectionHeader({ label: "Measure your ear" })}${earSteps.join("")}<div class="ui-cluster">${links}</div></section>
      <section data-guide="credits" class="ui-stack ui-stack--tight">${ui.sectionHeader({ label: "Credits" })}${credits.join("")}</section>
    </article>
  </div>`;
}

function wireGuide() {
  byId("screen-guide").addEventListener("click", (event) => {
    const target = event.target.closest("[data-act='guide']");

    if (!target) return;

    renderGuide(target.dataset.value);
    byId("screen-guide").querySelector(`[data-guide="${target.dataset.value}"]`).scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

accentColor = readToken("--accent");
renderTokens();
renderAccentPicker();
wireAccentPicker();
renderScales();
renderGallery();
wireGallery();
renderMapping();
renderGuide();
wireGuide();

mountView(byId("panel-narrow"), "narrow", { hasSetPicker: true });
mountView(byId("panel-start"), "start", { isHearing: false });
mountView(byId("header-tab"), "header");
mountView(byId("header-nothing"), "header", { isHearing: false });
mountView(byId("header-popup"), "header", { isPopup: true, heard: "YT Music", instruction: "goui is off for this window. Press ON to hear it again." });
mountView(byId("panel-wide"), "wide", { heard: "Every sound on this Mac", libraryTab: "sets" });
mountView(byId("sets-picker"), "setsPicker", { hasSetPicker: true });
mountView(byId("sets-library"), "setsLibrary", { libraryTab: "sets" });
mountView(byId("screen-menu"), "menu");
mountView(byId("screen-tile"), "tile");
mountView(byId("screen-site"), "hero", { heard: "Every sound on this Mac" });

function updateLevels() {
  const level = `${readLevelDb().toFixed(1)} dB`;

  for (const meter of document.querySelectorAll("[data-level] .ui-badge > span")) meter.textContent = level;
}

setInterval(() => {
  tickCount += 1;

  for (const graph of graphs) if (!graph.drag) graph.render();

  for (const plotHost of document.querySelectorAll(".ui-plot")) {
    const view = views.find((each) => each.host.contains(plotHost));
    const isDragging = plotHost.plot && plotHost.plot.drag;

    if (view && !isDragging) renderPlot(plotHost, view);
  }

  updateLevels();
}, 200);

window.addEventListener("resize", () => {
  for (const graph of graphs) graph.render();

  commit();
});

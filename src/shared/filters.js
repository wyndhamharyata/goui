/** @typedef {"PK" | "LSC" | "HSC" | "LSF" | "HSF" | "LP" | "HP" | "BP" | "NO" | "AP"} BandType */

/** @typedef {"headphone" | "ear"} LayerRole */

/**
 * @typedef {object} Band
 * @property {boolean} on
 * @property {BandType} type
 * @property {number} frequencyHz
 * @property {number} gainDb
 * @property {number} q
 */

/**
 * @typedef {object} Layer
 * @property {boolean} on
 * @property {string} source
 * @property {string} name
 * @property {boolean} isEdited
 * @property {Band[]} bands
 * @property {AutoEqOrigin} [autoEq]
 */

/** @typedef {{ name: string, path: string, target: string }} AutoEqOrigin */

/** @typedef {{ bassDb: number, vocalsDb: number, trebleDb: number }} Sliders */

/**
 * @typedef {object} Config
 * @property {boolean} enabled
 * @property {number} preampDb
 * @property {boolean} autoPreamp
 * @property {Sliders} sliders
 * @property {{ headphone: Layer, ear?: Layer }} layers
 */

/** @typedef {{ enabled: boolean, preampDb: number, bands: Band[] }} PlayedSound */

/** @typedef {{ role: LayerRole, bands: Band[] }} LayerBands */

/** @typedef {{ preampDb: number, bands: Band[] }} AutoEqFile */

export const bandTypes = ["PK", "LSC", "HSC", "LSF", "HSF", "LP", "HP", "BP", "NO", "AP"];

export const typeLabels = {
  PK: "Peak",
  LSC: "Low shelf",
  HSC: "High shelf",
  LSF: "Low shelf (slope)",
  HSF: "High shelf (slope)",
  LP: "High cut",
  HP: "Low cut",
  BP: "Band pass",
  NO: "Notch",
  AP: "All pass",
};

// A shelf in the Web Audio API takes no Q, so LSC and LSF build the same node.
export const audioNodeType = {
  PK: "peaking",
  LSC: "lowshelf",
  HSC: "highshelf",
  LSF: "lowshelf",
  HSF: "highshelf",
  LP: "lowpass",
  HP: "highpass",
  BP: "bandpass",
  NO: "notch",
  AP: "allpass",
};

const typesWithGain = new Set(["PK", "LSC", "HSC", "LSF", "HSF"]);

/**
 * @param {BandType} type
 * @returns {boolean}
 */
export function hasGain(type) {
  return typesWithGain.has(type);
}

// Every place that sets a Q uses these, so a typed Q and a dragged Q keep the same range.
export const qRange = [0.1, 18];
export const qStepRatio = 1.12;
export const frequencyRangeHz = [20, 20_000];
export const gainRangeDb = [-20, 20];
export const sliderRangeDb = [-6, 6];
export const preampRangeDb = [-24, 12];
// 1/√2 to two places, the Q AutoEQ writes on its shelves. A file with no Q gets it too.
export const butterworthQ = 0.71;
// AutoEQ puts the bass of its targets in a low shelf at this corner. The Bass slider uses the same.
export const autoEqBassShelfHz = 105;
// Every curve goui works out uses this many points. The targets in targets.json are stored on it.
export const sweepPointCount = 121;

// BW = (2 / ln2) * asinh(1 / (2Q)), RBJ Audio EQ Cookbook, with BW in octaves.
/**
 * @param {number} q
 * @returns {number}
 */
export function qToOctaves(q) {
  return (2 / Math.LN2) * Math.asinh(1 / (2 * q));
}

// Q = 1 / (2 sinh(ln2 / 2 * BW)), RBJ Audio EQ Cookbook, with BW in octaves.
/**
 * @param {number} octaves
 * @returns {number}
 */
export function octavesToQ(octaves) {
  return 1 / (2 * Math.sinh((Math.LN2 / 2) * octaves));
}

// Gains move in steps of 0.1 dB, the step an AutoEQ file and the gain field show.
/**
 * @param {number} gainDb
 * @returns {number}
 */
export function roundGainDb(gainDb) {
  return Math.round(gainDb * 10) / 10;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export const layerOrder = ["headphone", "ear"];
export const layerLabels = { headphone: "Headphone", ear: "My ear" };

/**
 * @param {string} name
 * @param {string} source
 * @param {Band[]} [bands]
 * @returns {Layer}
 */
export function makeLayer(name, source, bands = []) {
  return { on: true, source, name, isEdited: false, bands };
}

export const flatSliders = { bassDb: 0, vocalsDb: 0, trebleDb: 0 };

/** @returns {Config} */
export function defaultConfig() {
  return {
    enabled: true,
    preampDb: 0,
    autoPreamp: true,
    sliders: { ...flatSliders },
    layers: { headphone: makeLayer("Flat", "Starter sound") },
  };
}

/**
 * @param {number} frequencyHz
 * @returns {Band}
 */
export function newBand(frequencyHz) {
  return { on: true, type: "PK", frequencyHz: frequencyHz || newBandFrequencyHz, gainDb: 0, q: 1 };
}

const newBandFrequencyHz = 1000;

// Every edit of a band goes through these, so a typed, stepped and dragged value keep one range.
/**
 * @param {Band} band
 * @param {number} frequencyHz
 */
export function setBandFrequency(band, frequencyHz) {
  band.frequencyHz = Math.round(clamp(frequencyHz || newBandFrequencyHz, ...frequencyRangeHz));
}

/**
 * @param {Band} band
 * @param {number} gainDb
 */
export function setBandGain(band, gainDb) {
  if (hasGain(band.type)) band.gainDb = clamp(roundGainDb(gainDb || 0), ...gainRangeDb);
}

/**
 * @param {Band} band
 * @param {number} q
 */
export function setBandQ(band, q) {
  band.q = clamp(q || 1, ...qRange);
}

// A layer's bands, cleaned one by one, so a bad file cannot reach the audio chain.
/**
 * @param {unknown} raw
 * @returns {Band[]}
 */
export function cleanBands(raw) {
  const bands = Array.isArray(raw) ? raw : [];
  return bands.filter((band) => band && typeof band === "object").map((band) => ({
    on: band.on !== false,
    type: bandTypes.includes(band.type) ? band.type : "PK",
    frequencyHz: clamp(Number(band.frequencyHz) || newBandFrequencyHz, ...frequencyRangeHz),
    gainDb: clamp(Number(band.gainDb) || 0, ...gainRangeDb),
    q: clamp(Number(band.q) || butterworthQ, ...qRange),
  }));
}

/**
 * @param {unknown} raw
 * @param {string} fallbackName
 * @returns {Layer}
 */
function cleanLayer(raw, fallbackName) {
  const layer = {
    on: !raw || raw.on !== false,
    source: raw && typeof raw.source === "string" ? raw.source : "Sound",
    name: raw && typeof raw.name === "string" ? raw.name : fallbackName,
    isEdited: Boolean(raw && raw.isEdited),
    bands: cleanBands(raw && raw.bands),
  };
  const autoEq = raw && raw.autoEq;
  const isAutoEq = Boolean(autoEq) && ["name", "path", "target"].every((key) => typeof autoEq[key] === "string");
  if (isAutoEq) layer.autoEq = { name: autoEq.name, path: autoEq.path, target: autoEq.target };
  return layer;
}

// Used on a stored config and on an imported saved sound, so a bad file cannot reach the audio chain.
/**
 * @param {unknown} raw
 * @returns {Config}
 */
export function sanitizeConfig(raw) {
  if (!raw || typeof raw !== "object") return defaultConfig();
  const sliders = raw.sliders || raw.macros || {};
  /**
   * @param {unknown} value
   * @returns {number}
   */
  const sliderDb = (value) => clamp(Number(value) || 0, ...sliderRangeDb);

  // A config stored before the layers holds one flat list. That list becomes the headphone layer.
  // A config stored before the rename uses profileName and profileKind.
  const older = {
    headphone: {
      on: true,
      source: raw.soundKind ?? raw.profileKind,
      name: raw.soundName ?? raw.profileName,
      isEdited: raw.isEdited,
      bands: raw.bands,
    },
  };
  const storedLayers = raw.layers || older;
  const layers = { headphone: cleanLayer(storedLayers.headphone, "Flat") };
  if (storedLayers.ear) layers.ear = cleanLayer(storedLayers.ear, "Ear tuning");

  return {
    enabled: raw.enabled !== false,
    preampDb: clamp(Number(raw.preampDb) || 0, ...preampRangeDb),
    autoPreamp: raw.autoPreamp !== false,
    sliders: { bassDb: sliderDb(sliders.bassDb), vocalsDb: sliderDb(sliders.vocalsDb), trebleDb: sliderDb(sliders.trebleDb) },
    layers,
  };
}

// Every layer that is on, in a fixed order. The engine plays these, and the panel draws them.
/**
 * @param {Config} config
 * @returns {LayerBands[]}
 */
export function listOnLayers(config) {
  return layerOrder
    .filter((role) => config.layers[role] && config.layers[role].on)
    .map((role) => ({ role, bands: config.layers[role].bands }));
}

// The three Listen sliders, as bands on top of the sound's own bands. They stay in the chain at
// 0 dB, so a slider move never rebuilds the audio nodes.
function sliderBands(sliders) {
  return [
    { on: true, type: "LSC", frequencyHz: autoEqBassShelfHz, gainDb: sliders.bassDb, q: butterworthQ },
    { on: true, type: "PK", frequencyHz: 2500, gainDb: sliders.vocalsDb, q: 0.9 },
    { on: true, type: "HSC", frequencyHz: 8000, gainDb: sliders.trebleDb, q: butterworthQ },
  ];
}

// The Web Audio low and high pass read Q in dB. AutoEQ writes a plain Q, as the other types do.
/**
 * @param {Band} band
 * @returns {number}
 */
export function biquadQ(band) {
  const readsDb = band.type === "LP" || band.type === "HP";
  return readsDb ? 20 * Math.log10(band.q) : band.q;
}

/**
 * @param {BaseAudioContext} context
 * @param {Band} band
 * @returns {BiquadFilterNode}
 */
export function makeBiquad(context, band) {
  const node = context.createBiquadFilter();
  node.type = audioNodeType[band.type];
  node.frequency.value = band.frequencyHz;
  node.Q.value = biquadQ(band);
  if (hasGain(band.type)) node.gain.value = band.gainDb;
  return node;
}

// The panel draws with the same nodes the engine plays, so the curve matches the sound. Made on
// first use, so a file that only reads AutoEQ text can load where Web Audio is missing.
let offlineContext;

/**
 * @param {Band[]} bands
 * @param {Float32Array} frequencies
 * @returns {Float32Array}
 */
export function responseDb(bands, frequencies) {
  const totals = new Float32Array(frequencies.length);
  const magnitudes = new Float32Array(frequencies.length);
  const phases = new Float32Array(frequencies.length);
  offlineContext ??= new OfflineAudioContext(1, 1, 48_000);
  for (const band of bands) {
    if (!band.on) continue;
    makeBiquad(offlineContext, band).getFrequencyResponse(frequencies, magnitudes, phases);
    for (let index = 0; index < totals.length; index += 1) totals[index] += 20 * Math.log10(magnitudes[index]);
  }
  return totals;
}

// Points from 20 Hz to 20 kHz, evenly spaced on a log scale.
/**
 * @param {number} pointCount
 * @returns {Float32Array}
 */
export function logSweepHz(pointCount) {
  const [lowHz, highHz] = frequencyRangeHz;
  return Float32Array.from({ length: pointCount }, (_, index) => lowHz * ((highHz / lowHz) ** (index / (pointCount - 1))));
}

/**
 * @param {Band[]} bands
 * @returns {number}
 */
export function maxBoostDb(bands) {
  return Math.max(0, ...responseDb(bands, logSweepHz(sweepPointCount)));
}

// Auto preamp lowers the sound by its highest boost, so the loudest frequency never clips.
/**
 * @param {Band[]} bands
 * @returns {number}
 */
export function autoPreampDb(bands) {
  return 0 - maxBoostDb(bands);
}

// Every layer that is on, then the sliders on top.
/**
 * @param {Config} config
 * @returns {Band[]}
 */
export function listPlayedBands(config) {
  return [...listOnLayers(config).flatMap((layer) => layer.bands), ...sliderBands(config.sliders)];
}

// What the audio chain plays, the played bands and the preamp.
/**
 * @param {Config} config
 * @returns {PlayedSound}
 */
export function makePlayedSound(config) {
  const bands = listPlayedBands(config);
  const preampDb = config.autoPreamp ? autoPreampDb(bands) : config.preampDb;
  return { enabled: config.enabled, preampDb, bands };
}

// Export writes one flat file, so another app can read the merged sound.
/**
 * @param {Config} config
 * @returns {Band[]}
 */
export function listExportBands(config) {
  return listPlayedBands(config).filter((band) => !hasGain(band.type) || band.gainDb !== 0);
}

const typeAliases = { PEAK: "PK", PEAKING: "PK", LOWPASS: "LP", HIGHPASS: "HP", NOTCH: "NO" };

// An AutoEQ line reads "Filter 1: ON PK Fc 105 Hz Gain -3.1 dB Q 0.70", with Gain and Q optional.
/**
 * @param {string} text
 * @returns {AutoEqFile}
 */
export function parseAutoEq(text) {
  const bands = [];
  let preampDb = 0;
  for (const line of text.split("\n")) {
    const words = line.trim().split(" ").filter((word) => word !== "");
    const label = (words[0] || "").toLowerCase();
    if (label === "preamp:") {
      preampDb = Number(words[1]);
      continue;
    }
    if (label !== "filter") continue;

    /**
     * @param {string} name
     * @returns {number | undefined}
     */
    const readAfter = (name) => {
      const at = words.findIndex((word) => word.toLowerCase() === name);
      return at < 0 ? undefined : Number(words[at + 1]);
    };
    const typeWord = (words[3] || "").toUpperCase();
    const type = typeAliases[typeWord] || typeWord;
    const frequencyHz = readAfter("fc");
    const isBand = bandTypes.includes(type) && Number.isFinite(frequencyHz);
    if (!isBand) continue;

    bands.push({ on: words[2].toUpperCase() === "ON", type, frequencyHz, gainDb: readAfter("gain") ?? 0, q: readAfter("q") ?? butterworthQ });
  }
  return { bands, preampDb };
}

/**
 * @param {AutoEqFile} file
 * @returns {string}
 */
export function toAutoEq(file) {
  const lines = [`Preamp: ${file.preampDb.toFixed(1)} dB`];
  file.bands.forEach((band, index) => {
    const on = band.on ? "ON" : "OFF";
    const gain = hasGain(band.type) ? ` Gain ${band.gainDb.toFixed(1)} dB` : "";
    lines.push(`Filter ${index + 1}: ${on} ${band.type} Fc ${Math.round(band.frequencyHz)} Hz${gain} Q ${band.q.toFixed(2)}`);
  });
  return lines.join("\n");
}

/** @typedef {"PK" | "LSC" | "HSC" | "LSF" | "HSF" | "LP" | "HP" | "BP" | "NO" | "AP"} BandType */

/**
 * @typedef {object} Band
 * @property {boolean} on
 * @property {BandType} type
 * @property {number} frequencyHz
 * @property {number} gainDb
 * @property {number} q
 */

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

const newBandFrequencyHz = 1000;

/**
 * @param {number} frequencyHz
 * @returns {Band}
 */
export function newBand(frequencyHz) {
  return { on: true, type: "PK", frequencyHz: frequencyHz || newBandFrequencyHz, gainDb: 0, q: 1 };
}

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

// One band: its types, its limits, its setters, and the Web Audio node that plays it.
import { clamp, linearToDb, logInterpolate } from "./math.js";

/** @typedef {"PK" | "LSC" | "HSC" | "LSF" | "HSF" | "LP" | "HP" | "BP" | "NO" | "AP"} BandType */

/**
 * @typedef {object} Band
 * @property {boolean} on
 * @property {BandType} type
 * @property {number} frequencyHz
 * @property {number} gainDb
 * @property {number} q
 */

/** @typedef {{ label: string, node: string, hasGain: boolean }} BandTypeDetail */

// A Web Audio shelf takes no Q, so LSC and LSF build the same node.
/** @type {Record<BandType, BandTypeDetail>} */
export const bandTypeDetails = {
  PK: { label: "Peak", node: "peaking", hasGain: true },
  LSC: { label: "Low shelf", node: "lowshelf", hasGain: true },
  HSC: { label: "High shelf", node: "highshelf", hasGain: true },
  LSF: { label: "Low shelf (slope)", node: "lowshelf", hasGain: true },
  HSF: { label: "High shelf (slope)", node: "highshelf", hasGain: true },
  LP: { label: "High cut", node: "lowpass", hasGain: false },
  HP: { label: "Low cut", node: "highpass", hasGain: false },
  BP: { label: "Band pass", node: "bandpass", hasGain: false },
  NO: { label: "Notch", node: "notch", hasGain: false },
  AP: { label: "All pass", node: "allpass", hasGain: false },
};

export const bandTypes = Object.keys(bandTypeDetails);

/**
 * @param {BandType} type
 * @returns {boolean}
 */
export function hasGain(type) {
  return bandTypeDetails[type].hasGain;
}

// Every place that sets a Q uses these, so a typed Q and a dragged Q keep the same range.
export const qRange = [0.1, 18];
export const qStepRatio = 1.12;

export const frequencyRangeHz = [20, 20_000];
export const gainRangeDb = [-20, 20];

// The Butterworth Q, 1/√2 rounded as AutoEQ writes it: https://en.wikipedia.org/wiki/Butterworth_filter
export const butterworthQ = 0.71;

// AutoEQ puts the bass of its targets in a low shelf at this corner. The Bass slider uses it too.
export const autoEqBassShelfHz = 105;

// Every curve goui works out has this many points. targets.json is stored on the same points.
export const sweepPointCount = 121;

export const newBandFrequencyHz = 1000;

// Gains move in steps of 0.1 dB, the step an AutoEQ file and the gain field show.
/**
 * @param {number} gainDb
 * @returns {number}
 */
export function roundGainDb(gainDb) {
  return Math.round(gainDb * 10) / 10;
}

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
  return readsDb ? linearToDb(band.q) : band.q;
}

/**
 * @param {BaseAudioContext} context
 * @param {Band} band
 * @returns {BiquadFilterNode}
 */
export function createBiquad(context, band) {
  const node = context.createBiquadFilter();

  node.type = bandTypeDetails[band.type].node;

  node.frequency.value = band.frequencyHz;
  node.Q.value = biquadQ(band);

  if (hasGain(band.type)) node.gain.value = band.gainDb;

  return node;
}

// Made on first use, so a Node script can import this file where Web Audio is missing.
let offlineContext;

// The curve comes from the nodes the engine plays, so the picture matches the sound.
/**
 * @param {Band[]} bands
 * @param {Float32Array} frequencies
 * @returns {Float32Array}
 */
export function responseDb(bands, frequencies) {
  offlineContext ??= new OfflineAudioContext(1, 1, 48_000);

  const totalsDb = new Float32Array(frequencies.length);
  const magnitudes = new Float32Array(frequencies.length);
  const phases = new Float32Array(frequencies.length);

  for (const band of bands) {
    if (!band.on) continue;

    createBiquad(offlineContext, band).getFrequencyResponse(frequencies, magnitudes, phases);

    for (let index = 0; index < totalsDb.length; index += 1) {
      totalsDb[index] += linearToDb(magnitudes[index]);
    }
  }

  return totalsDb;
}

// Points from 20 Hz to 20 kHz, evenly spaced on a log scale.
/**
 * @param {number} pointCount
 * @returns {Float32Array}
 */
export function logSweepHz(pointCount) {
  const [lowHz, highHz] = frequencyRangeHz;
  return Float32Array.from({ length: pointCount }, (_, index) => logInterpolate(lowHz, highHz, index / (pointCount - 1)));
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

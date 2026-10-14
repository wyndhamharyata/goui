import { bandTypes, butterworthQ, hasGain } from "./shared/bands.js";

/** @typedef {import("./shared/bands.js").Band} Band */

/** @typedef {{ preampDb: number, bands: Band[] }} AutoEqFile */

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

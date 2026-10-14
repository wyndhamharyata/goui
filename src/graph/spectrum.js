// The live spectrum of the tab, under the curve.
import { frequencyRangeHz } from "../shared/bands.js";
import { clamp, logPosition, octavesBetween } from "../shared/math.js";
import { placePoint } from "./view.js";

/** @typedef {import("./view.js").View} View */

const spectrumFill = `fill="rgba(150,165,200,0.13)"`;
// A floor 100 dB below full scale puts a normal song around the middle of the spectrum fill.
const spectrumFloorDb = -100;

// The offscreen document sends its points on logSweepHz, so a frequency finds its point the same way.
/**
 * @param {number[]} spectrumDb
 * @param {number} frequencyHz
 * @returns {number}
 */
function readSpectrumAt(spectrumDb, frequencyHz) {
  const [lowHz, highHz] = frequencyRangeHz;
  const position = logPosition(frequencyHz, lowHz, highHz) * (spectrumDb.length - 1);
  return spectrumDb[clamp(Math.round(position), 0, spectrumDb.length - 1)];
}

/**
 * @param {View} view
 * @param {Float32Array} frequencies
 * @param {number[]} spectrumDb
 * @returns {string}
 */
export function drawSpectrum(view, frequencies, spectrumDb) {
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

// The tall view mirrors the spectrum and tilts it 3 dB per octave upright, so it spans 90 dB, not 100.
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
    const levelDb = readSpectrumAt(spectrumDb, frequencyHz) + (3 * octavesBetween(1000, frequencyHz));
    const halfWidth = clamp((levelDb - spectrumFloorDb) / spanDb, 0, 1) * rise;
    const center = placePoint(view, frequencyHz, 0);
    right.push(`${center.x + halfWidth},${center.y}`);
    left.unshift(`${center.x - halfWidth},${center.y}`);
  }

  return `<polygon points="${[...right, ...left].join(" ")}" ${spectrumFill}/>`;
}

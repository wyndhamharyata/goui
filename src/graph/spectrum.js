// The live spectrum of the tab, under the curve.
import { frequencyRangeHz } from "../shared/bands.js";
import { clamp, logPosition, octavesBetween } from "../shared/math.js";
import { spectrumStyle } from "./styles.js";
import { makePolygon } from "./svg.js";
import { placePoint } from "./view.js";

/** @typedef {import("./view.js").View} View */

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
 * @returns {SVGElement[]}
 */
export function drawSpectrum(view, frequencies, spectrumDb) {
  if (spectrumDb.length === 0) return [];
  if (view.isTall) return [drawMirroredSpectrum(view, frequencies, spectrumDb)];

  const { size } = view;
  const bottom = size.top + size.plotHeight;
  const edge = Array.from(frequencies, (frequencyHz) => {
    const level = clamp((readSpectrumAt(spectrumDb, frequencyHz) - spectrumFloorDb) / (0 - spectrumFloorDb), 0, 1);
    return { x: placePoint(view, frequencyHz, 0).x, y: size.top + (size.plotHeight * (1 - level)) };
  });
  const floor = [{ x: size.left + size.plotWidth, y: bottom }, { x: size.left, y: bottom }];

  return [makePolygon([...edge, ...floor], spectrumStyle)];
}

// The tall view mirrors the spectrum and tilts it 3 dB per octave upright, so it spans 90 dB, not 100.
function drawMirroredSpectrum(view, frequencies, spectrumDb) {
  const spanDb = 90;
  const rise = view.size.plotWidth * 0.45;
  const right = [];
  const left = [];
  for (const frequencyHz of frequencies) {
    const levelDb = readSpectrumAt(spectrumDb, frequencyHz) + (3 * octavesBetween(1000, frequencyHz));
    const halfWidth = clamp((levelDb - spectrumFloorDb) / spanDb, 0, 1) * rise;
    const center = placePoint(view, frequencyHz, 0);
    right.push({ x: center.x + halfWidth, y: center.y });
    left.unshift({ x: center.x - halfWidth, y: center.y });
  }

  return makePolygon([...right, ...left], spectrumStyle);
}

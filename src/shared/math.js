// The formulas goui uses, each named for what it works out.

// JavaScript has no built-in clamp.
/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// dB = 20 log10(ratio), for an amplitude ratio.
/**
 * @param {number} linear
 * @returns {number}
 */
export function linearToDb(linear) {
  return 20 * Math.log10(linear);
}

/**
 * @param {number} levelDb
 * @returns {number}
 */
export function dbToLinear(levelDb) {
  return 10 ** (levelDb / 20);
}

/**
 * @param {number} from
 * @param {number} to
 * @param {number} share
 * @returns {number}
 */
export function blend(from, to, share) {
  return ((1 - share) * from) + (share * to);
}

/**
 * @param {ArrayLike<number>} values
 * @returns {number}
 */
export function meanSquare(values) {
  let total = 0;
  for (let index = 0; index < values.length; index += 1) total += values[index] ** 2;

  return total / values.length;
}

/**
 * @param {ArrayLike<number>} samples
 * @returns {number}
 */
export function rootMeanSquare(samples) {
  return Math.sqrt(meanSquare(samples));
}

// Where a value falls between low and high on a log scale, from 0 at low to 1 at high.
/**
 * @param {number} value
 * @param {number} low
 * @param {number} high
 * @returns {number}
 */
export function logPosition(value, low, high) {
  return Math.log(value / low) / Math.log(high / low);
}

/**
 * @param {number} low
 * @param {number} high
 * @param {number} position
 * @returns {number}
 */
export function logInterpolate(low, high, position) {
  return low * ((high / low) ** position);
}

/**
 * @param {number} fromHz
 * @param {number} toHz
 * @returns {number}
 */
export function octavesBetween(fromHz, toHz) {
  return Math.log2(toHz / fromHz);
}

/**
 * @param {number} octaves
 * @returns {number}
 */
export function octavesToRatio(octaves) {
  return 2 ** octaves;
}

/**
 * @param {number} semitones
 * @returns {number}
 */
export function semitonesToRatio(semitones) {
  const semitonesPerOctave = 12;
  return octavesToRatio(semitones / semitonesPerOctave);
}

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

// How the graph and the panel write a frequency and a gain.

/**
 * @param {number} frequencyHz
 * @returns {string}
 */
export function formatHz(frequencyHz) {
  if (frequencyHz >= 1000) return `${Math.round(frequencyHz / 100) / 10}k`;
  return `${Math.round(frequencyHz)}`;
}

/**
 * @param {number} gainDb
 * @returns {string}
 */
export function formatDb(gainDb) {
  return `${gainDb > 0 ? "+" : ""}${gainDb.toFixed(1)}`;
}

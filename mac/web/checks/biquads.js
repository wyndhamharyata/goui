// Compares the C filters the app plays with WebKit's own, for every band type at three sample rates.
import { bandTypes, createBiquad, logSweepHz } from "../../../src/shared/bands.js";
import { linearToDb } from "../../../src/shared/math.js";
import { macMessageTypes, send } from "../bridge.js";

const sampleRatesHz = [16_000, 44_100, 48_000];
const toleranceDb = 0.01;
// Near silence a tiny difference is a large one in dB, so both sides stop at this floor.
const floorDb = -80;
const sweepHz = logSweepHz(241);

// 12 kHz and 19 kHz are above the Nyquist frequency at 16 kHz, where each type plays as a fixed gain.
const bands = bandTypes.flatMap((type) =>
  [30, 1000, 7000, 12_000, 19_000].flatMap((frequencyHz) =>
    [-12, 6].flatMap((gainDb) => [0.5, 0.71, 4].map((q) => ({ on: true, type, frequencyHz, gainDb, q }))),
  ),
);

/**
 * @param {string} text
 * @returns {Promise<any>}
 */
function print(text) {
  return send({ type: macMessageTypes.print, text });
}

/**
 * @param {number} magnitude
 * @returns {number}
 */
function toFlooredDb(magnitude) {
  return Math.max(floorDb, linearToDb(magnitude));
}

async function compareAtRate(sampleRateHz) {
  const context = new OfflineAudioContext(1, 1, sampleRateHz);
  const pointsHz = sweepHz.filter((frequencyHz) => frequencyHz < sampleRateHz / 2);
  const magnitudes = new Float32Array(pointsHz.length);
  const phases = new Float32Array(pointsHz.length);

  let worst = { differenceDb: 0, band: undefined, atHz: 0 };

  for (const band of bands) {
    const cMagnitudes = await send({ type: macMessageTypes.response, band, sampleRateHz, frequenciesHz: [...pointsHz] });

    createBiquad(context, band).getFrequencyResponse(pointsHz, magnitudes, phases);

    for (const [index, atHz] of pointsHz.entries()) {
      const differenceDb = Math.abs(toFlooredDb(magnitudes[index]) - toFlooredDb(cMagnitudes[index]));

      if (differenceDb > worst.differenceDb) worst = { differenceDb, band, atHz };
    }
  }

  const verdict = worst.differenceDb <= toleranceDb ? "ok" : "FAILED";
  const where = worst.band ? ` for ${JSON.stringify(worst.band)} at ${Math.round(worst.atHz)} Hz` : "";

  await print(`${verdict} ${sampleRateHz} Hz: ${bands.length} bands, ${pointsHz.length} points each, worst ${worst.differenceDb.toFixed(4)} dB${where}`);
}

for (const sampleRateHz of sampleRatesHz) await compareAtRate(sampleRateHz);
await print("Check done.");

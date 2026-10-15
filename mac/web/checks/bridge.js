// Sends each bridge message and prints the reply to the app's log. The app opens it with --page.
import { macMessageTypes, onEvent, send } from "../bridge.js";

const settleMs = 3000;

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} text
 * @returns {Promise<any>}
 */
function print(text) {
  return send({ type: macMessageTypes.print, text });
}

/**
 * @param {number} preampDb
 * @param {boolean} [enabled]
 * @returns {object}
 */
function playSound(preampDb, enabled = true) {
  return { type: macMessageTypes.sound, sound: { enabled, preampDb, bands: [] } };
}

/**
 * @param {string} label
 * @param {object} message
 * @returns {Promise<void>}
 */
async function report(label, message) {
  try {
    await print(`${label}: ${JSON.stringify(await send(message))}`);
  } catch (error) {
    await print(`${label} was refused: ${error.message}`);
  }
}

/**
 * @param {string} label
 * @param {object} message
 * @returns {Promise<void>}
 */
async function reportLevels(label, message) {
  await report(label, message);
  await send({ type: macMessageTypes.meters });
  await wait(settleMs);
  await report("  meters", { type: macMessageTypes.meters });
}

onEvent((event) => print(`event: ${JSON.stringify(event)}`));
await report("status", { type: macMessageTypes.status });
await reportLevels("preamp -6", playSound(-6));
await reportLevels("preamp -12", playSound(-12));
await reportLevels("EQ off", playSound(-12, false));
await report("preamp -40, refused as below -24", playSound(-40));
await report("preamp +13, refused as above +12", playSound(13));
await report("power off", { type: macMessageTypes.power, isOn: false });
await report("status", { type: macMessageTypes.status });
await report("power on", { type: macMessageTypes.power, isOn: true });
await wait(settleMs);
await report("status", { type: macMessageTypes.status });
await report("an unknown message", { type: "nothing" });
await report("a sound with no sound", { type: macMessageTypes.sound });
await report("an unknown band type", { type: macMessageTypes.sound, sound: { enabled: true, preampDb: 0, bands: [{ on: true, type: "XX", frequencyHz: 1000, gainDb: 6, q: 1 }] } });
await reportLevels("a peak at 1 kHz, +6 dB", { type: macMessageTypes.sound, sound: { enabled: true, preampDb: -6, bands: [{ on: true, type: "PK", frequencyHz: 1000, gainDb: 6, q: 1 }] } });
await reportLevels("preamp -6", playSound(-6));
await report("keep preamp -6 for the next launch", { ...playSound(-6), type: macMessageTypes.keepSound });
await print("Check done.");

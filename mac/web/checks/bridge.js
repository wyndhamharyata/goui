// Sends each bridge message and prints the reply to the app's log. The app opens it with --page.
import { onEvent, send } from "../bridge.js";

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
  return send({ type: "print", text });
}

/**
 * @param {number} preampDb
 * @param {boolean} [enabled]
 * @returns {object}
 */
function playSound(preampDb, enabled = true) {
  return { type: "sound", sound: { enabled, preampDb, bands: [] } };
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
  await send({ type: "meters" });
  await wait(settleMs);
  await report("  meters", { type: "meters" });
}

onEvent((event) => print(`event: ${JSON.stringify(event)}`));
await report("status", { type: "status" });
await reportLevels("preamp -6", playSound(-6));
await reportLevels("preamp -12", playSound(-12));
await reportLevels("EQ off", playSound(-12, false));
await reportLevels("preamp -40, held to -24", playSound(-40));
await report("power off", { type: "power", isOn: false });
await report("status", { type: "status" });
await report("power on", { type: "power", isOn: true });
await wait(settleMs);
await report("status", { type: "status" });
await report("an unknown message", { type: "nothing" });
await report("a sound with no sound", { type: "sound" });
await reportLevels("preamp -6 to keep", playSound(-6));
await print("Check done.");

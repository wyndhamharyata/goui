import { logSweepHz } from "./bands.js";

/** @typedef {{ isCapturing: boolean, tabId?: number, title?: string, error?: string }} CaptureState */

/** @typedef {{ ok: boolean, error?: string }} AudioReply */

/**
 * @typedef {{ type: "audio:start", streamId: string }
 *   | { type: "audio:stop" }
 *   | { type: "audio:config", config: import("./config.js").Config }
 *   | { type: "audio:telemetry", levelDb: number, spectrumDb: number[] }
 *   | { type: "capture:state", state: CaptureState }
 *   | { type: "capture:start", tabId: number }
 *   | { type: "capture:stop" }} Message
 */

// The quietest level the offscreen document reports, for silence and for an empty spectrum bin.
export const silenceDb = -120;
export const spectrumPointCount = 128;

// The panel reads these points back on the same log scale.
const spectrumHz = logSweepHz(spectrumPointCount);

// The FFT bins nearest each point of the spectrum, as the panel draws it.
/**
 * @param {Float32Array} binsDb
 * @param {number} hzPerBin
 * @returns {number[]}
 */
export function toSpectrumDb(binsDb, hzPerBin) {
  return Array.from(spectrumHz, (frequencyHz) => {
    const levelDb = binsDb[Math.min(Math.round(frequencyHz / hzPerBin), binsDb.length - 1)];

    return Number.isFinite(levelDb) ? levelDb : silenceDb;
  });
}

// Every context hears every message. Each group names the context that reads it.
export const messageTypes = {
  // To the offscreen document, from the service worker. Each one gets an AudioReply.
  audioStart: "audio:start",
  audioStop: "audio:stop",
  // To the offscreen document, from the service worker and the panel. The Config plays as a PlayedSound.
  audioConfig: "audio:config",
  // To the panel, from the offscreen document, 20 times a second. spectrumDb holds logSweepHz(spectrumPointCount).
  audioTelemetry: "audio:telemetry",
  // To the panel, from the service worker.
  captureState: "capture:state",
  // To the service worker, from the popup, which has no icon click to answer.
  captureStart: "capture:start",
  captureStop: "capture:stop",
};

// A rejection means no context is open to read it, so it is dropped. A sender that needs a reply waits itself.
/**
 * @param {Message} message
 * @returns {Promise<unknown>}
 */
export function trySendMessage(message) {
  return chrome.runtime.sendMessage(message).catch(() => undefined);
}

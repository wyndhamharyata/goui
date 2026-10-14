/** @typedef {{ isCapturing: boolean, tabId?: number, title?: string, error?: string }} CaptureState */

/** @typedef {{ ok: boolean, error?: string }} AudioReply */

/**
 * @typedef {{ type: "audio:start", streamId: string }
 *   | { type: "audio:stop" }
 *   | { type: "audio:config", config: import("./filters.js").Config }
 *   | { type: "audio:telemetry", levelDb: number, spectrumDb: number[] }
 *   | { type: "capture:state", state: CaptureState }
 *   | { type: "capture:start", tabId: number }
 *   | { type: "capture:stop" }} Message
 */

// Every context hears every message. Each group names the context that reads it.
export const messageTypes = {
  // To the offscreen document, from the service worker. Each one gets an AudioReply.
  audioStart: "audio:start",
  audioStop: "audio:stop",
  // To the offscreen document, from the service worker and the panel. It holds a stored Config. The
  // offscreen document turns it into a PlayedSound.
  audioConfig: "audio:config",
  // To the panel, from the offscreen document, 20 times a second. spectrumDb holds logSweepHz(128).
  audioTelemetry: "audio:telemetry",
  // To the panel, from the service worker.
  captureState: "capture:state",
  // To the service worker, from the popup, which has no icon click to answer.
  captureStart: "capture:start",
  captureStop: "capture:stop",
};

// A message rejects when no other context is open to read it. The panel is often closed, so the
// error is dropped. A sender that needs the reply calls chrome.runtime.sendMessage itself.
/**
 * @param {Message} message
 * @returns {Promise<unknown>}
 */
export function trySendMessage(message) {
  return chrome.runtime.sendMessage(message).catch(() => undefined);
}

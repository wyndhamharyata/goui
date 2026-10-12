/** @typedef {{ isCapturing: boolean, tabId?: number, title?: string, error?: string }} CaptureState */

/** @typedef {{ ok: boolean, error?: string }} AudioReply */

/**
 * @typedef {{ type: "audio:start", streamId: string }
 *   | { type: "audio:stop" }
 *   | { type: "audio:config", config: import("./filters.js").Config }
 *   | { type: "audio:telemetry", levelDb: number, spectrumDb: number[] }
 *   | { type: "capture:state", state: CaptureState }} Message
 */

export const messageTypes = {
  audioStart: "audio:start",
  audioStop: "audio:stop",
  audioConfig: "audio:config",
  audioTelemetry: "audio:telemetry",
  captureState: "capture:state",
};

// A message rejects when no other context is open to read it. The panel is often closed, so that
// is not an error.
/**
 * @param {Message} message
 * @returns {Promise<AudioReply | undefined>}
 */
export function trySendMessage(message) {
  return chrome.runtime.sendMessage(message).catch(() => undefined);
}

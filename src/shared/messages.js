export const messageTypes = {
  audioStart: "audio:start",
  audioStop: "audio:stop",
  audioConfig: "audio:config",
  audioTelemetry: "audio:telemetry",
  captureState: "capture:state",
};

// A message rejects when no other context is open to read it. The panel is often closed, so that
// is not an error.
export function trySendMessage(message) {
  return chrome.runtime.sendMessage(message).catch(() => undefined);
}

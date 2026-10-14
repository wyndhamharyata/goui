// Stands in for the Chrome APIs the panel calls. A plain script ahead of the panel, so it imports late.

const macAppUrl = "goui://app/";
// The panel opens as the popup of this one stand-in tab, so its power button shows.
const macTabId = 1;
// The guide pages are written for Chrome, so the Mac opens the homepage until it has its own guide.
const macHomepageUrl = "https://goui.mwyndham.dev";
const macLevelEveryMs = 100;
const macListeners = [];
const macSession = {};

/**
 * @param {object} message
 * @returns {Promise<any>}
 */
function sendToMac(message) {
  return window.webkit.messageHandlers.goui.postMessage(message);
}

/**
 * @param {object} message
 */
function deliverToPanel(message) {
  for (const listener of macListeners) listener(message, {}, () => {});
}

/**
 * @param {string | string[] | object | null | undefined} keys
 * @returns {string[] | null}
 */
function toKeyList(keys) {
  if (keys === null || keys === undefined) return null;
  if (typeof keys === "string") return [keys];
  if (Array.isArray(keys)) return keys;

  return Object.keys(keys);
}

// An object of keys gives defaults, as in Chrome.
/**
 * @param {string | string[] | object | null | undefined} keys
 * @param {object} found
 * @returns {object}
 */
function withDefaults(keys, found) {
  const isDefaults = keys && typeof keys === "object" && !Array.isArray(keys);
  return isDefaults ? { ...keys, ...found } : found;
}

// The engine's status, told the way the panel reads a captured tab.
/**
 * @param {{ state: string, lastError?: string }} status
 * @returns {object}
 */
function toCaptureState(status) {
  if (status.state === "running") return { isCapturing: true, tabId: macTabId, title: "Every sound on this Mac" };
  if (status.state === "starting") return { isCapturing: false, error: "goui is starting. If macOS asks to record the system audio, press Allow." };
  if (status.state === "waitingToRetry") return { isCapturing: false, error: `goui could not start and tries again. ${status.lastError}` };

  return { isCapturing: false };
}

async function readCaptureState() {
  macSession.capture = toCaptureState(await sendToMac({ type: "status" }));
  return macSession.capture;
}

// A path in a user script resolves against the script, not the page, so each import names the app.
/**
 * @param {string} path
 * @returns {Promise<any>}
 */
function importFromApp(path) {
  return import(macAppUrl + path);
}

async function answerMessage(message) {
  const { messageTypes } = await importFromApp("src/shared/messages.js");
  // The popup asks to start as it opens. On the Mac only a press of its power button turns goui on.
  const isPress = navigator.userActivation.isActive;

  if (message?.type === messageTypes.audioConfig) {
    const { toPlayedSound } = await importFromApp("src/shared/config.js");
    return sendToMac({ type: "sound", sound: toPlayedSound(message.config) });
  }

  if (message?.type === messageTypes.captureStart && isPress) return sendToMac({ type: "power", isOn: true });
  if (message?.type === messageTypes.captureStop) return sendToMac({ type: "power", isOn: false });

  return undefined;
}

// The panel drops a failed send, so the failure goes to the app's log first.
/**
 * @param {object} message
 * @returns {Promise<any>}
 */
async function sendMessage(message) {
  try {
    return await answerMessage(message);
  } catch (error) {
    sendToMac({ type: "print", text: `Sending ${message?.type} failed: ${error}\n${error.stack}` });
    throw error;
  }
}

async function sendLevel() {
  if (document.visibilityState !== "visible" || macListeners.length === 0) return;

  const { messageTypes, silenceDb } = await importFromApp("src/shared/messages.js");
  const meters = await sendToMac({ type: "meters" });

  deliverToPanel({ type: messageTypes.audioTelemetry, levelDb: meters?.outputPeakDb ?? silenceDb, spectrumDb: [] });
}

// The page takes the panel's width, so a wide panel shows three columns. It also stops the page's edge from bouncing.
document.addEventListener("DOMContentLoaded", () => {
  const style = document.createElement("style");

  style.textContent = ".popup body { width: auto; } html, body { overscroll-behavior: none; }";
  document.head.append(style);
});

// The panel has no console on the Mac, so its errors go to the app's log.
window.addEventListener("error", (event) => sendToMac({ type: "print", text: `Error: ${event.message} at ${event.filename}:${event.lineno}` }));
window.addEventListener("unhandledrejection", (event) => sendToMac({ type: "print", text: `Rejected: ${event.reason?.stack ?? event.reason}` }));

window.addEventListener("goui", async (event) => {
  if (event.detail.type !== "status") return;

  const { messageTypes } = await importFromApp("src/shared/messages.js");

  macSession.capture = toCaptureState(event.detail.status);
  deliverToPanel({ type: messageTypes.captureState, state: macSession.capture });
});

window.chrome = {
  runtime: {
    getURL: (path) => macAppUrl + path,
    sendMessage,
    onMessage: { addListener: (listener) => macListeners.push(listener) },
  },
  storage: {
    local: {
      get: async (keys) => withDefaults(keys, await sendToMac({ type: "storage:get", keys: toKeyList(keys) })),
      set: (items) => sendToMac({ type: "storage:set", items }),
      remove: (keys) => sendToMac({ type: "storage:remove", keys: toKeyList(keys) }),
    },
    session: {
      get: async (keys) => {
        await readCaptureState();

        const names = toKeyList(keys) ?? Object.keys(macSession);

        return withDefaults(keys, Object.fromEntries(names.filter((name) => name in macSession).map((name) => [name, macSession[name]])));
      },
      set: async (items) => Object.assign(macSession, items),
      remove: async (keys) => {
        for (const name of toKeyList(keys) ?? []) delete macSession[name];
      },
    },
  },
  tabs: {
    create: ({ url }) => sendToMac({ type: "open", url: url.startsWith(macAppUrl) ? macHomepageUrl : url }),
  },
};

setInterval(sendLevel, macLevelEveryMs);
// The page's own height. Its scrollHeight never drops below the window, so the panel could only grow.
new ResizeObserver(() => sendToMac({ type: "size", height: Math.ceil(document.documentElement.getBoundingClientRect().height) })).observe(document.documentElement);

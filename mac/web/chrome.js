// Stands in for the Chrome APIs the panel calls. A plain script ahead of the panel, so it imports late.

const macAppUrl = "goui://app/";
// The panel opens as the popup of this one stand-in tab, so its power button shows.
const macTabId = 1;
// As often as the extension's offscreen document sends the level and spectrum.
const macLevelEveryMs = 50;
const macListeners = [];
const macSession = {};

// A path in a user script resolves against the script, not the page, so each import names the app.
/**
 * @param {string} path
 * @returns {Promise<any>}
 */
function importFromApp(path) {
  return import(macAppUrl + path);
}

// The type is a key of macMessageTypes in mac/web/bridge.js. A key missing from that list throws, so a typo shows at once.
/**
 * @param {string} type
 * @param {object} [fields]
 * @returns {Promise<any>}
 */
async function sendToMac(type, fields = {}) {
  const { macMessageTypes, send } = await importFromApp("mac/web/bridge.js");

  if (!Object.hasOwn(macMessageTypes, type)) throw new Error(`The bridge has no message called ${type}`);

  return send({ type: macMessageTypes[type], ...fields });
}

// A failed report must not raise another error, or the error handlers below would feed each other.
/**
 * @param {string} text
 */
function printToLog(text) {
  sendToMac("print", { text }).catch(() => {});
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
  macSession.capture = toCaptureState(await sendToMac("status"));
  return macSession.capture;
}

async function answerMessage(message) {
  const { messageTypes } = await importFromApp("src/shared/messages.js");
  // The popup asks to start as it opens. On the Mac only a press of its power button turns goui on.
  const isPress = navigator.userActivation.isActive;

  if (message?.type === messageTypes.audioConfig) {
    const { toPlayedSound } = await importFromApp("src/shared/config.js");
    return sendToMac("sound", { sound: toPlayedSound(message.config) });
  }

  if (message?.type === messageTypes.captureStart && isPress) return sendToMac("power", { isOn: true });
  if (message?.type === messageTypes.captureStop) return sendToMac("power", { isOn: false });

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
    printToLog(`Sending ${message?.type} failed: ${error}\n${error.stack}`);
    throw error;
  }
}

// The app plays the stored config from login, not the heard one, so an A/B or Solo held at a crash does not come back.
async function storeItems(items) {
  const { storageKeys } = await importFromApp("src/shared/storage.js");

  await sendToMac("storageSet", { items });

  if (!items[storageKeys.config]) return;

  const { toPlayedSound } = await importFromApp("src/shared/config.js");

  await sendToMac("keepSound", { sound: toPlayedSound(items[storageKeys.config]) });
}

async function sendLevel() {
  if (document.visibilityState !== "visible" || macListeners.length === 0) return;

  const { messageTypes, silenceDb } = await importFromApp("src/shared/messages.js");
  const { toLevel } = await importFromApp("mac/web/spectrum.js");
  const meters = await sendToMac("meters");
  const level = meters?.scope ? toLevel(meters.scope) : { levelDb: silenceDb, spectrumDb: [] };

  deliverToPanel({ type: messageTypes.audioLevel, ...level });
}

// The panel's words for what goui hears, told for the whole Mac and not one tab.
window.gouiWords = {
  idleInstruction: "goui is off. Press the power button to EQ every sound on this Mac.",
  powerOffTitle: "Turn goui off",
  powerOnTitle: "Turn goui on for every sound on this Mac",
};

document.addEventListener("DOMContentLoaded", async () => {
  const { buildElement } = await importFromApp("src/panel/dom.js");
  const { renderMacGuide } = await importFromApp("mac/web/guide.js");

  document.head.append(buildElement("link", { rel: "stylesheet", href: `${macAppUrl}mac/web/chrome.css` }));
  document.getElementById("eqbyear").title = "Open eqbyear.com in your browser, with My ear off, to measure your ear";
  renderMacGuide();
});

// The panel has no console on the Mac, so its errors go to the app's log.
window.addEventListener("error", (event) => printToLog(`Error: ${event.message} at ${event.filename}:${event.lineno}`));
window.addEventListener("unhandledrejection", (event) => printToLog(`Rejected: ${event.reason?.stack ?? event.reason}`));

window.addEventListener("goui", async (event) => {
  const { macEventTypes } = await importFromApp("mac/web/bridge.js");

  if (event.detail.type !== macEventTypes.status) return;

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
      get: async (keys) => withDefaults(keys, await sendToMac("storageGet", { keys: toKeyList(keys) })),
      set: storeItems,
      remove: (keys) => sendToMac("storageRemove", { keys: toKeyList(keys) }),
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
  // The guide pages are written for Chrome, so a goui page opens the Mac's own guide on the homepage.
  tabs: {
    create: ({ url }) => (url.startsWith(macAppUrl) ? sendToMac("openGuide") : sendToMac("open", { url })),
  },
};

setInterval(sendLevel, macLevelEveryMs);
// The page's own height. Its scrollHeight never drops below the window, so the panel could only grow.
new ResizeObserver(() => sendToMac("size", { height: Math.ceil(document.documentElement.getBoundingClientRect().height) })).observe(document.documentElement);

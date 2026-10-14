import { messageTypes, trySendMessage } from "./shared/messages.js";

/** @typedef {import("./shared/messages.js").CaptureState} CaptureState */

// The how-to page opens once, on the first install. A later reload of the folder does not open it.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install") return;
  chrome.tabs.create({ url: chrome.runtime.getURL("src/intro.html") });
});

// Older goui builds turned this setting on, and Chrome keeps it. With it on, an icon click never
// reaches onClicked.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

async function openOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "src/offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "The audio of the tab runs through the EQ in an offscreen document.",
  });
}

// The badge shows on the icon of the captured tab only, so each tab shows whether goui hears it.
/** @param {CaptureState} state */
async function publishCapture(state) {
  const { capture: previous } = await chrome.storage.session.get("capture");
  if (previous && previous.tabId) chrome.action.setBadgeText({ tabId: previous.tabId, text: "" }).catch(() => {});
  if (state.isCapturing) {
    chrome.action.setBadgeBackgroundColor({ tabId: state.tabId, color: "#43d39e" }).catch(() => {});
    chrome.action.setBadgeText({ tabId: state.tabId, text: "ON" }).catch(() => {});
  }
  await chrome.storage.session.set({ capture: state });
  trySendMessage({ type: messageTypes.captureState, state });
}

/**
 * @param {number} tabId
 * @returns {Promise<boolean>}
 */
async function isHeardTab(tabId) {
  const { capture } = await chrome.storage.session.get("capture");
  return Boolean(capture && capture.isCapturing) && capture.tabId === tabId;
}

/**
 * @param {chrome.tabs.Tab} target
 * @returns {Promise<CaptureState>}
 */
async function startCaptureForTab(target) {
  await openOffscreenDocument();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: target.id });
  const reply = await chrome.runtime.sendMessage({ type: messageTypes.audioStart, streamId });

  const isStarted = Boolean(reply && reply.ok);
  if (!isStarted) {
    const state = { isCapturing: false, error: reply ? reply.error : "The audio did not start." };
    await publishCapture(state);
    return state;
  }

  const stored = await chrome.storage.local.get("config");
  if (stored.config) await chrome.runtime.sendMessage({ type: messageTypes.audioConfig, config: stored.config });

  const state = { isCapturing: true, tabId: target.id, title: target.title || "Capturing" };
  await publishCapture(state);
  return state;
}

/** @returns {Promise<CaptureState>} */
async function stopCapture() {
  await trySendMessage({ type: messageTypes.audioStop });
  const state = { isCapturing: false };
  await publishCapture(state);
  return state;
}

// Brave crashes the whole browser when sidePanel.open names a window with no side panel, such as an
// installed app. A tab in such a window opens goui as a popup instead. Its click reaches onClicked
// only before its popup is set.
const allWindowTypes = ["normal", "popup", "panel", "app", "devtools"];
const popupWindowIds = new Set();

/** @param {number} tabId */
function setPanelPopupForTab(tabId) {
  chrome.action.setPopup({ tabId, popup: `src/panel.html?tab=${tabId}` }).catch(() => {});
}

/** @param {chrome.windows.Window} window */
function usePopupInWindowWithoutPanel(window) {
  if (window.type === "normal") return;
  popupWindowIds.add(window.id);
  for (const tab of window.tabs || []) setPanelPopupForTab(tab.id);
}

// The set lives in memory. A click can wake the service worker before the list arrives.
let areWindowsKnown = false;
const knownWindows = chrome.windows.getAll({ populate: true, windowTypes: allWindowTypes }).then((windows) => {
  windows.forEach(usePopupInWindowWithoutPanel);
  areWindowsKnown = true;
});

// Chrome forgets the popup of a tab on each page load, so each load sets it again.
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status !== "loading") return;
  chrome.windows.get(tab.windowId, { populate: true, windowTypes: allWindowTypes }).then(usePopupInWindowWithoutPanel, () => {});
});

// "Open in Brave" moves the tab of an app into a normal window, where the side panel works again.
chrome.tabs.onAttached.addListener(async (tabId, attach) => {
  const window = await chrome.windows.get(attach.newWindowId, { populate: true, windowTypes: allWindowTypes });
  if (window.type === "normal") chrome.action.setPopup({ tabId, popup: "" }).catch(() => {});
  usePopupInWindowWithoutPanel(window);
});

// The click grants the right to take the tab's audio. A click on the tab goui hears turns it off
// while the panel is open, and only brings the panel back while it is closed. A click on any other
// tab moves goui there.
chrome.action.onClicked.addListener(async (tab) => {
  // Chrome answers in the order it is asked. Asked before the panel opens, this sees the panel as it
  // was before the click.
  const panelsBeforeClick = chrome.runtime.getContexts({ documentUrls: [chrome.runtime.getURL("src/panel.html")] });
  // A wait can cost the click its gesture, so sidePanel.open fails and a second click is needed.
  // That beats a crash. Only a click that wakes the service worker waits.
  if (!areWindowsKnown) await knownWindows;
  if (popupWindowIds.has(tab.windowId)) setPanelPopupForTab(tab.id);
  else chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});

  if (await isHeardTab(tab.id)) {
    const wasPanelOpen = (await panelsBeforeClick).length > 0;
    if (wasPanelOpen) stopCapture();
    return;
  }

  const url = tab.url || "";
  const isWebPage = url.startsWith("http://") || url.startsWith("https://");
  if (!tab.id || !isWebPage) {
    publishCapture({ isCapturing: false, error: "Open a web page with audio, then click the goui icon." });
    return;
  }
  startCaptureForTab(tab).catch((error) => publishCapture({ isCapturing: false, error: error.message }));
});

/** @param {number} tabId */
async function startCaptureFromPopup(tabId) {
  if (await isHeardTab(tabId)) return;
  const tab = await chrome.tabs.get(tabId);
  await startCaptureForTab(tab);
}

// The popup has no click to answer, so it asks for its own tab when it opens and from its button.
// Only a tab in an app window has the popup, and an app is always a web page.
chrome.runtime.onMessage.addListener((message) => {
  const isStart = message && message.type === messageTypes.captureStart && Number.isInteger(message.tabId);
  if (isStart) startCaptureFromPopup(message.tabId).catch((error) => publishCapture({ isCapturing: false, error: error.message }));
  if (message && message.type === messageTypes.captureStop) stopCapture();
  return false;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (await isHeardTab(tabId)) stopCapture();
});

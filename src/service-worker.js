import { messageTypes, trySendMessage } from "./shared/messages.js";

/** @typedef {import("./shared/messages.js").CaptureState} CaptureState */

// The how-to page opens once, on the first install. A later reload of the folder does not open it.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install") return;
  chrome.tabs.create({ url: chrome.runtime.getURL("src/intro.html") });
});

// Chrome keeps this setting from older builds. With it on, an icon click never reaches onClicked.
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
// installed app. A tab in such a window opens goui as a popup instead, so its click never comes here.
const everyWindowType = ["normal", "popup", "panel", "app", "devtools"];
const popupWindowIds = new Set();

/** @param {number} tabId */
function usePopupOn(tabId) {
  chrome.action.setPopup({ tabId, popup: `src/panel.html?tab=${tabId}` }).catch(() => {});
}

/** @param {chrome.windows.Window} window */
function rememberWindow(window) {
  if (window.type === "normal") return;
  popupWindowIds.add(window.id);
  for (const tab of window.tabs || []) usePopupOn(tab.id);
}

chrome.windows.getAll({ populate: true, windowTypes: everyWindowType }).then((windows) => windows.forEach(rememberWindow));

// Chrome forgets the popup of a tab on each page load, so each load sets it again.
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status !== "loading") return;
  chrome.windows.get(tab.windowId, { populate: true, windowTypes: everyWindowType }).then(rememberWindow, () => {});
});

// "Open in Brave" moves the tab of an app into a normal window, where the side panel works again.
chrome.tabs.onAttached.addListener(async (tabId, attach) => {
  const window = await chrome.windows.get(attach.newWindowId, { populate: true, windowTypes: everyWindowType });
  if (window.type === "normal") chrome.action.setPopup({ tabId, popup: "" }).catch(() => {});
  rememberWindow(window);
});

// The click is what invokes the extension for the tab, which grants the right to take its audio.
// Open the panel first, while the gesture is fresh. A click on the tab goui hears turns it off. A
// click on any other tab moves goui there. With the panel closed, a click on the tab goui hears only
// brings the panel back. Chrome answers in the order it is asked, so the question asked before the
// panel opens sees the panel as it was before the click.
chrome.action.onClicked.addListener(async (tab) => {
  const openPanels = chrome.runtime.getContexts({ documentUrls: [chrome.runtime.getURL("src/panel.html")] });
  if (popupWindowIds.has(tab.windowId)) usePopupOn(tab.id);
  else chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});

  if (await isHeardTab(tab.id)) {
    const wasPanelOpen = (await openPanels).length > 0;
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

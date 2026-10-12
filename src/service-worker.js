import { messageTypes, trySendMessage } from "./shared/messages.js";

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

async function isHeardTab(tabId) {
  const { capture } = await chrome.storage.session.get("capture");
  return Boolean(capture && capture.isCapturing) && capture.tabId === tabId;
}

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

async function stopCapture() {
  await trySendMessage({ type: messageTypes.audioStop });
  const state = { isCapturing: false };
  await publishCapture(state);
  return state;
}

// The click is what invokes the extension for the tab, which grants the right to take its audio.
// Open the panel first, while the gesture is fresh. A click on the tab goui hears turns it off. A
// click on any other tab moves goui there.
chrome.action.onClicked.addListener(async (tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});

  if (await isHeardTab(tab.id)) {
    stopCapture();
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

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (await isHeardTab(tabId)) stopCapture();
});

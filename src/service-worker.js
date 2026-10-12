// Chrome keeps this setting from older builds. With it on, an icon click never reaches onClicked.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

// The panel itself is never the target. In a test it is an extension page in a normal tab.
async function readTargetTab() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const webPages = tabs.filter((tab) => tab.url && (tab.url.startsWith("http://") || tab.url.startsWith("https://")));
  const [newest] = webPages.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return newest;
}

async function openOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "src/offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "The audio of the tab runs through the EQ in an offscreen document.",
  });
}

async function publishCapture(state) {
  await chrome.storage.session.set({ capture: state });
  chrome.runtime.sendMessage({ type: "capture:state", state }).catch(() => {});
}

async function startCaptureForTab(target) {
  await openOffscreenDocument();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: target.id });
  const reply = await chrome.runtime.sendMessage({ type: "audio:start", streamId });

  const isStarted = Boolean(reply && reply.ok);
  if (!isStarted) {
    const state = { isCapturing: false, error: reply ? reply.error : "The audio did not start." };
    await publishCapture(state);
    return state;
  }

  const stored = await chrome.storage.local.get("config");
  if (stored.config) await chrome.runtime.sendMessage({ type: "audio:config", config: stored.config });

  const state = { isCapturing: true, title: target.title || "Capturing" };
  await publishCapture(state);
  return state;
}

async function stopCapture() {
  await chrome.runtime.sendMessage({ type: "audio:stop" }).catch(() => {});
  const state = { isCapturing: false };
  await publishCapture(state);
  return state;
}

// The click is what invokes the extension for the tab, which grants the right to take its audio.
// Open the panel first, while the gesture is fresh, then start the capture right away.
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});

  const url = tab.url || "";
  const isWebPage = url.startsWith("http://") || url.startsWith("https://");
  if (!tab.id || !isWebPage) {
    publishCapture({ isCapturing: false, error: "Open a web page with audio, then click the icon." });
    return;
  }
  startCaptureForTab(tab).catch((error) => publishCapture({ isCapturing: false, error: error.message }));
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || !message.type) return false;
  if (message.type === "capture:start") {
    readTargetTab()
      .then((target) => {
        if (!target) return publishCapture({ isCapturing: false, error: "No web page in this window to capture." });
        return startCaptureForTab(target);
      })
      .then(respond, (error) => {
        const isNotInvoked = error.message.includes("has not been invoked");
        const hint = "Click the goui icon in the toolbar while you are on the page you want to EQ.";
        const state = { isCapturing: false, error: isNotInvoked ? hint : error.message };
        publishCapture(state);
        respond(state);
      });
    return true;
  }
  if (message.type === "capture:stop") {
    stopCapture().then(respond, (error) => respond({ isCapturing: false, error: error.message }));
    return true;
  }
  return false;
});

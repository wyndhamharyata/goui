// What goui hears: the status line, the popup's power button, and the level and spectrum.
import { blend } from "../shared/math.js";
import { messageTypes, silenceDb, trySendMessage } from "../shared/messages.js";
import { byId } from "./dom.js";
import { graphs } from "./graphs.js";
import { sendAudio } from "./sound.js";
import { isPopup, popupTabId, state } from "./state.js";

const idleInstruction = isPopup
  ? "goui is off on this tab. Press the power button to EQ it."
  : "Click the goui icon in the toolbar while you are on the tab you want to EQ.";

/** @param {import("../shared/messages.js").CaptureState} capture */
export function applyCaptureState(capture) {
  const isCapturing = Boolean(capture.isCapturing);
  // The first tab goui hears ends the guide for good.
  if (isCapturing && byId("app").dataset.started === "no") {
    byId("app").dataset.started = "yes";
    chrome.storage.local.set({ hasCaptured: true });
  }
  const status = byId("status");
  status.textContent = capture.error || (isCapturing ? capture.title : idleInstruction);
  status.classList.toggle("instruction", !isCapturing);
  status.title = isCapturing && !isPopup ? "Click the goui icon on this tab to turn goui off, or on another tab to move it there." : "";

  state.isPopupTabHeard = isCapturing && capture.tabId === popupTabId;
  byId("powerText").textContent = state.isPopupTabHeard ? "ON" : "OFF";
  byId("power").setAttribute("aria-pressed", String(state.isPopupTabHeard));
  byId("power").title = state.isPopupTabHeard ? "Turn goui off on this tab" : "Turn goui on for this tab";
}

/** @param {{ levelDb: number, spectrumDb: number[] }} message */
function applyTelemetry(message) {
  byId("level").textContent = message.levelDb <= silenceDb ? "--" : message.levelDb.toFixed(1);
  // Each reading is raw. Blending with the last frame keeps the spectrum calm to look at.
  const newShare = 0.3;
  const previous = state.spectrumDb;
  state.spectrumDb = message.spectrumDb.map((levelDb, index) => (previous.length ? blend(previous[index], levelDb, newShare) : levelDb));
  for (const graph of graphs) graph.renderSpectrum();
}

// The service worker starts a tab with the stored config, so an open panel sends the A/B and Solo it shows.
/** @returns {void} */
export function wireMessages() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === messageTypes.captureState) {
      applyCaptureState(message.state);
      if (message.state.isCapturing) sendAudio();
    }
    if (message && message.type === messageTypes.audioTelemetry) applyTelemetry(message);
    return false;
  });
}

// Opening the popup counts as the click on the icon, so goui starts on its tab right away.
/** @returns {void} */
export function startPopup() {
  document.documentElement.classList.add("popup");
  byId("power").hidden = false;
  const start = { type: messageTypes.captureStart, tabId: popupTabId };
  byId("power").addEventListener("click", () => trySendMessage(state.isPopupTabHeard ? { type: messageTypes.captureStop } : start));
  trySendMessage(start);
}

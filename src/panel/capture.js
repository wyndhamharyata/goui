// What goui hears: the status line, the popup's power button, and the level, clip light and spectrum.
import { maxBoostDb } from "../shared/bands.js";
import { toPlayedSound } from "../shared/config.js";
import { blend } from "../shared/math.js";
import { messageTypes, silenceDb, trySendMessage } from "../shared/messages.js";
import { storageKeys } from "../shared/storage.js";
import { byId } from "./dom.js";
import { graphs } from "./graphs.js";
import { onRefresh } from "./refresh.js";
import { sendAudio } from "./sound.js";
import { isPopup, popupTabId, state } from "./state.js";

// A page that holds the panel, as the Mac app does, can name what goui hears with window.gouiWords.
const words = {
  idleInstruction: isPopup ? "goui is off on this tab. Press the power button to EQ it." : "Click the goui icon in the toolbar while you are on the tab you want to EQ.",
  powerOffTitle: "Turn goui off on this tab",
  powerOnTitle: "Turn goui on for this tab",
  ...globalThis.gouiWords,
};

// The light is red while the EQ can clip and green while it cannot. With nothing heard it is grey.
function renderMeter() {
  const played = toPlayedSound(state.config);
  // A rounding margin, so a boost that auto preamp offsets exactly never shows red.
  const clipMarginDb = 0.05;
  const headroomDb = maxBoostDb(played.bands) + played.preampDb;
  const isClipping = state.config.enabled && headroomDb > clipMarginDb;
  const meter = byId("meter");
  let title = isClipping ? `The EQ can clip by ${headroomDb.toFixed(1)} dB. Turn the preamp down or press Auto.` : "Output level. No clipping.";

  if (!state.isCapturing) title = "Output level. goui hears nothing now.";

  meter.classList.toggle("tone-danger", state.isCapturing && isClipping);
  meter.classList.toggle("tone-good", state.isCapturing && !isClipping);
  meter.classList.toggle("tone-muted", !state.isCapturing);
  meter.title = title;
}

// With nothing heard, the level and the spectrum go blank, so an old reading never stays up.
function clearLevel() {
  byId("level").textContent = "--";
  state.spectrumDb = [];

  for (const graph of graphs) graph.renderSpectrum();
}

/** @param {import("../shared/messages.js").CaptureState} capture */
export function applyCaptureState(capture) {
  const isCapturing = Boolean(capture.isCapturing);

  // The first tab goui hears ends the guide for good.
  if (isCapturing && byId("app").dataset.started === "no") {
    byId("app").dataset.started = "yes";
    chrome.storage.local.set({ [storageKeys.hasCaptured]: true });
  }

  const status = byId("status");

  state.isCapturing = isCapturing;
  status.textContent = capture.error || (isCapturing ? capture.title : words.idleInstruction);
  byId("hearing").classList.toggle("is-instruction", !isCapturing || Boolean(capture.error));
  status.title = isCapturing && !isPopup ? "Click the goui icon on this tab to turn goui off, or on another tab to move it there." : "";

  if (!isCapturing) clearLevel();

  renderMeter();

  state.isPopupTabHeard = isCapturing && capture.tabId === popupTabId;
  byId("powerText").textContent = state.isPopupTabHeard ? "ON" : "OFF";
  byId("power").setAttribute("aria-pressed", String(state.isPopupTabHeard));
  byId("power").classList.toggle("is-on", state.isPopupTabHeard);
  byId("power").title = state.isPopupTabHeard ? words.powerOffTitle : words.powerOnTitle;
}

// A reading sent just before the capture stopped can arrive after it, so it is dropped.
function applyLevel(message) {
  if (!state.isCapturing) return;

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

    if (message && message.type === messageTypes.audioLevel) applyLevel(message);

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

onRefresh(renderMeter);

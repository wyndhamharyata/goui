// The panel's state, in one object so every panel file reads and writes the same values.
import { defaultConfig } from "../shared/config.js";

/** @typedef {import("../shared/bands.js").Band} Band */

/** @typedef {import("../autoeq.js").TargetData} TargetData */

export const state = {
  config: defaultConfig(),
  // Each layer has its own presets of bands only. A list has no prototype, so a name such as constructor stays plain.
  presets: { headphone: Object.create(null), ear: Object.create(null), taste: Object.create(null) },
  // A Set names its presets, so an edit to a preset reaches every Set that names it. It has no prototype either.
  /** @type {Record<string, import("../shared/config.js").SoundSet>} */
  sets: Object.create(null),
  /** @type {Band | null} */
  selectedBand: null,
  /** @type {Band | null} */
  soloBand: null,
  isCapturing: false,
  isComparing: false,
  isLevelMatched: false,
  isPopupTabHeard: false,
  isMoreOpen: false,
  /** @type {number[]} */
  spectrumDb: [],
  openActions: { headphone: "", ear: "", taste: "" },
  // Loaded before the first draw, so the Listen row can show the target choice at once.
  /** @type {TargetData | null} */
  targetData: null,
};

// A window with no side panel, such as an installed app, opens this page as the popup of one tab.
export const popupTabId = Number(new URLSearchParams(location.search).get("tab"));
export const isPopup = Number.isInteger(popupTabId) && popupTabId > 0;
export const isMac = new URLSearchParams(location.search).has("mac");

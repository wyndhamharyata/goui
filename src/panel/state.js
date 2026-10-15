// The panel's state, in one object so every panel file reads and writes the same values.
import { defaultConfig } from "../shared/config.js";

/** @typedef {import("../shared/bands.js").Band} Band */

/** @typedef {import("../autoeq.js").TargetData} TargetData */

export const state = {
  config: defaultConfig(),
  // Each layer has its own presets. A preset holds bands only, so the sliders and the preamp stay.
  presets: { headphone: {}, ear: {}, taste: {} },
  /** @type {Band | null} */
  selectedBand: null,
  /** @type {Band | null} */
  soloBand: null,
  isComparing: false,
  isLevelMatched: false,
  isPopupTabHeard: false,
  isMoreOpen: false,
  /** @type {number[]} */
  spectrumDb: [],
  openActions: { headphone: "", ear: "", taste: "" },
  /** @type {import("../shared/config.js").LayerRole} */
  libraryRole: "headphone",
  // Loaded before the first draw, so the Listen row can show the target choice at once.
  /** @type {TargetData | null} */
  targetData: null,
};

// The source line under a layer's name. A layer matches one of your presets only while its source is saved.
export const layerSources = {
  saved: "Saved",
  deleted: "Deleted preset",
  autoEq: "AutoEQ",
  starter: "Starter sound",
  pasted: "Pasted",
  file: "From a file",
  yourBands: "Your bands",
};

// A window with no side panel, such as an installed app, opens this page as the popup of one tab.
export const popupTabId = Number(new URLSearchParams(location.search).get("tab"));
export const isPopup = Number.isInteger(popupTabId) && popupTabId > 0;

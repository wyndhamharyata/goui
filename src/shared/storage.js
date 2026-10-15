// Every key goui stores. The session key holds what goui hears. The others are in local storage.
export const storageKeys = {
  config: "config",
  sets: "sets",
  presets: { headphone: "headphonePresets", ear: "earPresets", taste: "tastePresets" },
  tab: "tab",
  libraryRole: "libraryRole",
  isLevelMatched: "isLevelMatched",
  view: "view",
  hasCaptured: "hasCaptured",
  autoEqIndex: "autoEqIndex",
  autoEqIndexAt: "autoEqIndexAt",
  capture: "capture",
  // Older builds wrote these names. The panel reads them once and moves them to the keys above.
  olderSounds: ["savedSounds", "presets"],
  olderLevelMatch: "keepsPreampInCompare",
};

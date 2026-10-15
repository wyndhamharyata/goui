// The side panel, and the popup in a window with no side panel. This file wires the page and starts it.
import { bandTypeDetails, bandTypes } from "../shared/bands.js";
import { layerOrder, sanitizeConfig } from "../shared/config.js";
import { loadTargets } from "../autoeq.js";
import { applyCaptureState, startPopup, wireMessages } from "./capture.js";
import { byId, buildElement, showTab, wireTabs } from "./dom.js";
import { graphs, renderPills, wireGraphButtons } from "./graphs.js";
import { renderHeadphoneList } from "./headphones.js";
import { renderLayerLists, wireLibrary } from "./library.js";
import { setSliderRanges, wireListen } from "./listen.js";
import { readPresets } from "./presets.js";
import { refresh } from "./refresh.js";
import { commit, sendAudio, setComparing } from "./sound.js";
import { isPopup, state } from "./state.js";
import { wireTune } from "./tune.js";

// The keys startPanel reads. savedSounds, presets and keepsPreampInCompare are older names it still loads.
const storedKeys = [
  "config", "headphonePresets", "earPresets", "tastePresets", "view", "tab", "libraryRole", "hasCaptured", "isLevelMatched",
  "savedSounds", "presets", "keepsPreampInCompare",
];

function wireHeader() {
  for (const id of ["help", "guide", "credits"]) {
    byId(id).addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("src/intro.html") }));
  }

  byId("compare").addEventListener("pointerdown", () => setComparing(true));
  byId("compare").addEventListener("pointerup", () => setComparing(false));
  byId("compare").addEventListener("pointerleave", () => setComparing(false));
  byId("enabled").addEventListener("change", (event) => {
    state.config.enabled = event.target.checked;
    commit();
  });
}

async function startPanel() {
  // The band type grid holds the common types. The select under More holds the rest.
  const rareTypes = bandTypes.filter((type) => !byId("bandSegments").querySelector(`[data-type="${type}"]`));
  const placeholder = buildElement("option", { value: "", text: "Pick a rarer type", disabled: true });

  byId("bandType").append(placeholder, ...rareTypes.map((type) => new Option(bandTypeDetails[type].label, type)));

  setSliderRanges();

  state.targetData = await loadTargets();

  const stored = await chrome.storage.local.get(storedKeys);

  byId("app").dataset.started = stored.hasCaptured ? "yes" : "no";
  // Older settings name Level match keepsPreampInCompare and the tall view "vertical", so both names still load.
  state.isLevelMatched = (stored.isLevelMatched ?? stored.keepsPreampInCompare) === true;
  byId("levelMatch").checked = state.isLevelMatched;

  if (stored.config) state.config = sanitizeConfig(stored.config);

  await readPresets(stored);
  for (const graph of graphs) graph.setTall(stored.view === "tall" || stored.view === "vertical");

  showTab("tab", stored.tab || "listen");
  showTab("role", layerOrder.includes(stored.libraryRole) ? stored.libraryRole : "headphone");
  renderPills();
  sendAudio();
  refresh();
  renderHeadphoneList();
  renderLayerLists();

  const session = await chrome.storage.session.get("capture");

  applyCaptureState(session.capture || { isCapturing: false });

  if (isPopup) startPopup();
}

wireHeader();
wireTabs();
wireListen();
wireGraphButtons();
wireTune();
wireLibrary();
wireMessages();
startPanel();

// The side panel, and the popup in a window with no side panel. This file wires the page and starts it.
import { bandTypeDetails, bandTypes } from "../shared/bands.js";
import { layerOrder, sanitizeConfig, sanitizeSets } from "../shared/config.js";
import { storageKeys } from "../shared/storage.js";
import { loadTargets } from "../autoeq.js";
import { buildStartSteps } from "../guide.js";
import { applyCaptureState, startPopup, wireMessages } from "./capture.js";
import { byId, buildElement, showTab, wireTabs } from "./dom.js";
import { graphs, renderPills, wireGraphButtons } from "./graphs.js";
import { renderHeadphoneList } from "./headphones.js";
import { renderLayerLists, renderLibrarySections, wireLibrary } from "./library.js";
import { setSliderRanges, wireListen } from "./listen.js";
import { readPresets } from "./presets.js";
import { refresh } from "./refresh.js";
import { setMacSets, wireSets } from "./sets.js";
import { commit, sendAudio, setComparing } from "./sound.js";
import { isPopup, state } from "./state.js";
import { wireTune } from "./tune.js";

// The keys startPanel reads, with the older names it still loads.
const storedKeys = [
  storageKeys.config, ...Object.values(storageKeys.presets), storageKeys.sets, storageKeys.view, storageKeys.tab, storageKeys.libraryRole,
  storageKeys.hasCaptured, storageKeys.isLevelMatched, ...storageKeys.olderSounds, storageKeys.olderLevelMatch,
];

const panelTabs = ["listen", "tune", "library"];
const libraryTabs = [...layerOrder, "sets"];
// A key held on A/B holds it as a pointer does.
const holdKeys = new Set([" ", "Enter"]);

function wireHeader() {
  const guideURL = chrome.runtime.getURL("src/intro.html");

  byId("help").addEventListener("click", () => chrome.tabs.create({ url: guideURL }));
  byId("guide").addEventListener("click", () => chrome.tabs.create({ url: guideURL }));
  byId("credits").addEventListener("click", () => chrome.tabs.create({ url: `${guideURL}#credits` }));

  const compare = byId("compare");

  compare.addEventListener("pointerdown", () => setComparing(true));
  compare.addEventListener("keydown", (event) => {
    if (holdKeys.has(event.key)) setComparing(true);
  });

  // A cancelled touch or a window that loses focus never sends the release, so each one lets go too.
  for (const type of ["pointerup", "pointerleave", "pointercancel", "blur"]) compare.addEventListener(type, () => setComparing(false));

  compare.addEventListener("keyup", (event) => {
    if (holdKeys.has(event.key)) setComparing(false);
  });
  window.addEventListener("blur", () => setComparing(false));
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

  byId("app").dataset.started = stored[storageKeys.hasCaptured] ? "yes" : "no";
  // Older settings name Level match keepsPreampInCompare and the tall view "vertical", so both names still load.
  state.isLevelMatched = (stored[storageKeys.isLevelMatched] ?? stored[storageKeys.olderLevelMatch]) === true;
  byId("levelMatch").checked = state.isLevelMatched;

  if (stored[storageKeys.config]) state.config = sanitizeConfig(stored[storageKeys.config]);

  state.sets = sanitizeSets(stored[storageKeys.sets]);

  await readPresets(stored);
  setMacSets();

  const view = stored[storageKeys.view];
  const tab = stored[storageKeys.tab];
  const libraryRole = stored[storageKeys.libraryRole];

  for (const graph of graphs) graph.setTall(view === "tall" || view === "vertical");

  showTab("tab", panelTabs.includes(tab) ? tab : "listen");
  showTab("role", libraryTabs.includes(libraryRole) ? libraryRole : "headphone");
  renderPills();
  sendAudio();
  refresh();
  renderHeadphoneList();
  renderLayerLists();

  const session = await chrome.storage.session.get(storageKeys.capture);

  applyCaptureState(session[storageKeys.capture] || { isCapturing: false });

  if (isPopup) startPopup();
}

renderLibrarySections();
byId("guideSteps").append(...buildStartSteps());
wireHeader();
wireTabs();
wireListen();
wireGraphButtons();
wireTune();
wireLibrary();
wireSets();
wireMessages();
startPanel();

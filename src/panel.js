// The side panel, and the popup in a window with no side panel.
import {
  autoPreampDb,
  bandTypes,
  butterworthQ,
  cleanBands,
  hasGain,
  maxBoostDb,
  newBand,
  qStepRatio,
  setBandFrequency,
  setBandGain,
  setBandQ,
  bandTypeDetails,
} from "./shared/bands.js";
import { qToOctaves } from "./shared/math.js";
import {
  defaultConfig,
  flatSliders,
  layerLabels,
  layerOrder,
  listExportBands,
  listOnLayers,
  listPlayedBands,
  makeLayer,
  makePlayedSound,
  preampRangeDb,
  sanitizeConfig,
  sliderRangeDb,
} from "./shared/config.js";
import { describeMeasurement, fetchHeadphone, findFamily, loadAutoEqIndex, loadTargets, makeAutoEqItem, parseAutoEq, toAutoEq } from "./autoeq.js";
import { messageTypes, silenceDb, trySendMessage } from "./shared/messages.js";
import { formatDb, formatHz, layerColor, makeGraph, typeColor } from "./graph.js";

/** @typedef {import("./shared/bands.js").Band} Band */

/** @typedef {import("./shared/config.js").Config} Config */

/** @typedef {import("./shared/config.js").Layer} Layer */

/** @typedef {import("./shared/config.js").LayerRole} LayerRole */

/** @typedef {import("./shared/config.js").LayerBands} LayerBands */

/** @typedef {import("./shared/config.js").AutoEqOrigin} AutoEqOrigin */

/** @typedef {import("./graph.js").BandEntry} BandEntry */

/** @typedef {import("./autoeq.js").AutoEqItem} AutoEqItem */

/** @typedef {import("./autoeq.js").TargetData} TargetData */

/** @typedef {{ name: string, source: string, bands: Band[], preampDb?: number, autoEq?: AutoEqOrigin }} NewLayer */

// The source line under a layer's name. A layer matches one of your presets only while its source is saved.
const layerSources = {
  saved: "Saved",
  deleted: "Deleted preset",
  autoEq: "AutoEQ",
  starter: "Starter sound",
  pasted: "Pasted",
  file: "From a file",
  yourBands: "Your bands",
};

const starterPresets = [
  { name: "Flat", bands: [] },
  {
    name: "Warm",
    bands: [
      { on: true, type: "LSC", frequencyHz: 120, gainDb: 3, q: butterworthQ },
      { on: true, type: "HSC", frequencyHz: 8000, gainDb: -2, q: butterworthQ },
    ],
  },
  { name: "Clear vocals", bands: [{ on: true, type: "PK", frequencyHz: 2500, gainDb: 3, q: 1 }] },
  {
    name: "Night listening",
    bands: [
      { on: true, type: "LSC", frequencyHz: 100, gainDb: -3, q: butterworthQ },
      { on: true, type: "HSC", frequencyHz: 6000, gainDb: -3, q: butterworthQ },
    ],
  },
];

const pastedNames = { headphone: "Pasted headphone", ear: "Pasted ear tuning" };
const storageWaitMs = 120;
const typingPauseMs = 150;
const maxResultCount = 20;
const minQueryLength = 2;
const semitonesPerOctave = 12;
const gainStepDb = 0.5;
const newBandFrequencyHz = 1000;

// A window with no side panel, such as an installed app, opens this page as the popup of one tab.
const popupTabId = Number(new URLSearchParams(location.search).get("tab"));
const isPopup = Number.isInteger(popupTabId) && popupTabId > 0;
const idleInstruction = isPopup
  ? "goui is off on this tab. Press the power button to EQ it."
  : "Click the goui icon in the toolbar while you are on the tab you want to EQ.";

// The keys startPanel reads. savedSounds, presets and keepsPreampInCompare come from older builds.
const storedKeys = [
  "config", "headphonePresets", "earPresets", "view", "tab", "hasCaptured", "isLevelMatched",
  "savedSounds", "presets", "keepsPreampInCompare",
];

let config = defaultConfig();
// Each layer has its own presets. A preset holds bands only, so the sliders and the preamp stay.
const presets = { headphone: {}, ear: {} };
/** @type {Band | null} */
let selectedBand = null;
/** @type {Band | null} */
let soloBand = null;
let isComparing = false;
let isLevelMatched = false;
let isPopupTabHeard = false;
let isMoreOpen = false;
let spectrumDb = [];
const openActions = { headphone: "", ear: "" };
// Loaded before the first draw, so the Listen row can show the target choice at once.
/** @type {TargetData} */
let targetData;

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
const byId = (id) => document.getElementById(id);

// The Library has one section per layer. Both sections use the same class names inside.
/**
 * @param {LayerRole} role
 * @returns {HTMLElement}
 */
const sectionOf = (role) => document.querySelector(`.preset-section[data-role="${role}"]`);

/**
 * @param {LayerRole} role
 * @param {string} name
 * @returns {HTMLElement}
 */
const partOf = (role, name) => sectionOf(role).querySelector(`.${name}`);

/**
 * @param {string} tag
 * @param {{ className?: string, text?: string | number, title?: string }} [options]
 * @returns {HTMLElement}
 */
function makeElement(tag, options = {}) {
  const { className = "", text = "", title = "" } = options;
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== "") element.textContent = text;
  if (title) element.title = title;

  return element;
}

/**
 * @param {() => void} run
 * @param {number} waitMs
 * @returns {() => void}
 */
function debounce(run, waitMs) {
  let timer = 0;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(run, waitMs);
  };
}

/**
 * @param {LayerRole} role
 * @param {string} text
 */
function showHint(role, text) {
  partOf(role, "action-hint").textContent = text;
}

/**
 * @param {Layer | undefined} layer
 * @returns {Band[]}
 */
function readBands(layer) {
  return layer ? layer.bands : [];
}

// Every band in layer order, with its layer. The graph, the chips and the table number bands by this list.
/** @returns {BandEntry[]} */
function listBandEntries() {
  return layerOrder.flatMap((role) => readBands(config.layers[role]).map((band) => ({ role, band })));
}

/** @returns {number} */
function readSelectedIndex() {
  return listBandEntries().findIndex((entry) => entry.band === selectedBand);
}

/** @returns {LayerRole | undefined} */
function readSelectedRole() {
  const entry = listBandEntries().find((each) => each.band === selectedBand);
  return entry && entry.role;
}

// An index past the list, such as -1, chooses no band.
/** @param {number} index */
function selectBand(index) {
  const entry = listBandEntries()[index];
  selectedBand = entry ? entry.band : null;
  refresh();
}

// A new layer holds new band objects, so neither the choice nor Solo can point into it.
function dropBandChoice() {
  selectedBand = null;
  soloBand = null;
}

// Holding A/B and the main switch both silence the EQ. The graph then draws a flat line.
/** @returns {boolean} */
function isEqOff() {
  return isComparing || !config.enabled;
}

/**
 * @param {(layer: Layer) => Layer} change
 * @returns {Config["layers"]}
 */
function mapLayers(change) {
  const layers = {};
  for (const role of layerOrder) if (config.layers[role]) layers[role] = change(config.layers[role]);
  return layers;
}

// Level match plays the preamp the EQ uses with every band off. Auto would set 0 dB for no bands.
/** @returns {Config} */
function makePreampOnlyConfig() {
  const layers = mapLayers((layer) => ({ ...layer, on: false }));
  return { ...config, layers, sliders: flatSliders, autoPreamp: false, preampDb: makePlayedSound(config).preampDb };
}

/** @returns {Config} */
function makeSoloConfig() {
  const layers = mapLayers((layer) => ({ ...layer, on: true, bands: layer.bands.map((band) => ({ ...band, on: band === soloBand })) }));
  return { ...config, layers, sliders: flatSliders };
}

// The config the engine plays and the graph draws, with A/B and Solo applied. A/B wins over Solo.
/** @returns {Config} */
function makeHeardConfig() {
  if (isComparing) return isLevelMatched ? makePreampOnlyConfig() : { ...config, enabled: false };
  return soloBand ? makeSoloConfig() : config;
}

/** @returns {Band[]} */
function listCurveBands() {
  const heard = makeHeardConfig();
  return heard.enabled ? listPlayedBands(heard) : [];
}

// Each layer's own curve, for the dashed lines under the total. Solo and A/B draw none.
/** @returns {LayerBands[]} */
function listCurveLayers() {
  return isEqOff() || soloBand ? [] : listOnLayers(config);
}

function sendAudio() {
  trySendMessage({ type: messageTypes.audioConfig, config: makeHeardConfig() });
}

const storeConfig = debounce(() => chrome.storage.local.set({ config }), storageWaitMs);

// The sound follows every edit at once. Only the storage write waits for the edits to pause.
function commit() {
  sendAudio();
  storeConfig();
  refresh();
}

// A layer whose bands changed shows "edited", so you can tell it from the preset you picked.
/** @param {LayerRole | undefined} role */
function markEdited(role) {
  if (role && config.layers[role]) config.layers[role].isEdited = true;
}

function commitBandEdit() {
  markEdited(readSelectedRole());
  commit();
}

/**
 * @param {LayerRole} role
 * @param {number} frequencyHz
 * @param {number} gainDb
 */
function addBandToLayer(role, frequencyHz, gainDb) {
  // The headphone layer is always there. The ear layer starts with its first band.
  if (role === "ear") config.layers.ear ??= makeLayer("My ear tuning", layerSources.yourBands);
  const band = { ...newBand(frequencyHz), gainDb };
  config.layers[role].bands.push(band);
  selectedBand = band;
  markEdited(role);
  commit();
}

function deleteSelectedBand() {
  const role = readSelectedRole();
  const layer = config.layers[role];
  layer.bands.splice(layer.bands.indexOf(selectedBand), 1);
  if (soloBand === selectedBand) soloBand = null;
  selectedBand = null;
  markEdited(role);
  commit();
}

function removeEarLayer() {
  delete config.layers.ear;
  dropBandChoice();
  commit();
}

// A lone headphone file needs its own preamp, so it is kept. Auto preamp overrides it either way.
/**
 * @param {NewLayer} sound
 * @param {LayerRole} role
 */
function replaceLayer(sound, role) {
  config.layers[role] = makeLayer(sound.name, sound.source, cleanBands(sound.bands));
  if (sound.autoEq) config.layers[role].autoEq = sound.autoEq;
  if (role === "headphone" && sound.preampDb !== undefined) config.preampDb = sound.preampDb;
  dropBandChoice();
  commit();
}

// The graph changes the band objects in config itself while you drag, then calls commitBandEdit.
/** @type {import("./graph.js").GraphHooks} */
const graphHooks = {
  listBandEntries,
  listCurveBands,
  listCurveLayers,
  readSpectrumDb: () => spectrumDb,
  readSelectedIndex,
  isEqOff,
  selectBand,
  commitBandEdit,
  // A new band joins the layer of the selected band. With none selected it joins the headphone layer.
  addBand: (frequencyHz, gainDb) => addBandToLayer(readSelectedRole() || "headphone", frequencyHz, gainDb),
};

// The Listen graph is a preview. It matches the Tune graph in size and follows its zoom and turn.
const graphHeights = { height: 210, tallHeight: 440 };
const listenGraph = makeGraph(byId("listenGraph"), { ...graphHeights, interactive: false }, graphHooks);
const tuneGraph = makeGraph(byId("tuneGraph"), { ...graphHeights, interactive: true }, graphHooks);
const graphs = [listenGraph, tuneGraph];

function refresh() {
  for (const graph of graphs) graph.render();
  renderLayers();
  renderPresetCards();
  renderSound();
  renderChips();
  renderInspector();
  renderTable();
}

// A field the person is typing in keeps their text.
/**
 * @param {string} id
 * @param {string | number} value
 */
function setField(id, value) {
  const field = byId(id);
  if (field !== document.activeElement) field.value = value;
}

/**
 * @param {Layer} layer
 * @returns {string}
 */
function describeLayerName(layer) {
  return layer.isEdited ? `${layer.name}, edited` : layer.name;
}

/**
 * @param {Band[]} bands
 * @returns {string}
 */
function describeBandCount(bands) {
  return bands.length === 1 ? "1 band" : `${bands.length} bands`;
}

/** @param {LayerRole} role */
function openLibrarySection(role) {
  showTab("library");
  sectionOf(role).scrollIntoView({ block: "start" });
}

// The targets a headphone from AutoEQ can take. A family with one target shows its name only.
/**
 * @param {AutoEqOrigin} autoEq
 * @returns {HTMLElement}
 */
function makeTargetChoice(autoEq) {
  const family = findFamily(targetData.families, makeAutoEqItem(autoEq.name, autoEq.path));
  const choice = makeElement("label", { className: "target", text: "Target", title: "The sound AutoEQ tunes your headphone toward" });
  if (!family || family.labels.length < 2) {
    choice.append(makeElement("span", { text: autoEq.target }));
    return choice;
  }
  const select = makeElement("select");
  for (const label of family.labels) select.append(new Option(label, label));
  select.value = autoEq.target;
  select.addEventListener("change", () => changeTarget(select.value));
  choice.append(select);

  return choice;
}

/**
 * @param {LayerRole} role
 * @param {Layer} layer
 * @returns {HTMLElement}
 */
function makeLayerRow(role, layer) {
  const toggle = makeElement("label", { className: "switch", title: `Turn the ${layerLabels[role]} layer on or off` });
  const box = makeElement("input");
  box.type = "checkbox";
  box.checked = layer.on;
  box.addEventListener("change", () => {
    layer.on = box.checked;
    commit();
  });
  toggle.append(box, makeElement("span", { className: "track" }));

  const caption = makeElement("small", { className: "caption" });
  const mark = makeElement("i", { className: "layer-mark" });
  mark.style.borderColor = layerColor[role];
  caption.append(mark, `${layerLabels[role]} · ${layer.source}`);
  const text = makeElement("div", { className: "grow" });
  text.append(caption, makeElement("b", { text: describeLayerName(layer) }));
  if (layer.autoEq) text.append(makeTargetChoice(layer.autoEq));

  const change = makeElement("button", { text: "Change" });
  change.addEventListener("click", () => openLibrarySection(role));

  const row = makeElement("div", { className: layer.on ? "layer" : "layer off" });
  row.append(toggle, text, change);
  if (role === "ear") {
    const remove = makeElement("button", { text: "×", title: "Take the ear layer off" });
    remove.addEventListener("click", removeEarLayer);
    row.append(remove);
  }

  return row;
}

/** @returns {HTMLElement} */
function makeAddEarButton() {
  const add = makeElement("button", {
    text: "Add your ear tuning on top",
    title: "Open My ear in the Library, to paste an eqbyear result or pick a saved ear preset",
  });
  add.addEventListener("click", () => {
    openLibrarySection("ear");
    if (openActions.ear !== "paste") toggleLibraryAction("ear", "paste");
  });

  return add;
}

// The stack on Listen. One row per layer, each with its own switch, its source and its name.
function renderLayers() {
  const host = byId("layers");
  host.replaceChildren();
  for (const role of layerOrder) {
    const layer = config.layers[role];
    if (layer) host.append(makeLayerRow(role, layer));
  }
  if (!config.layers.ear) host.append(makeAddEarButton());
}

function renderSound() {
  const played = makePlayedSound(config);
  byId("enabled").checked = config.enabled;

  for (const sliderName of ["bass", "vocals", "treble"]) {
    setField(sliderName, config.sliders[`${sliderName}Db`]);
    byId(`${sliderName}Value`).textContent = `${formatDb(config.sliders[`${sliderName}Db`])} dB`;
  }

  setField("preamp", played.preampDb.toFixed(1));
  byId("preampValue").textContent = `${formatDb(played.preampDb)} dB`;
  byId("autoPreamp").classList.toggle("on", config.autoPreamp);
  byId("preampNote").textContent = config.autoPreamp ? "Auto" : "Manual";

  // A rounding margin, so a boost that auto preamp offsets exactly never shows red.
  const clipMarginDb = 0.05;
  const headroomDb = maxBoostDb(played.bands) + played.preampDb;
  const isClipping = config.enabled && headroomDb > clipMarginDb;
  byId("clip").classList.toggle("red", isClipping);
  byId("meter").title = isClipping
    ? `The EQ can clip by ${headroomDb.toFixed(1)} dB. Turn the preamp down or press Auto.`
    : "Output level. No clipping.";
}

// One row per layer, each with its own label and its own Add band chip.
function renderChips() {
  const host = byId("chips");
  host.replaceChildren();
  const entries = listBandEntries();
  for (const role of layerOrder) {
    const track = makeElement("div", { className: "chip-track" });
    entries.forEach((entry, index) => {
      if (entry.role !== role) return;
      const chip = makeElement("button", { className: "chip" });
      chip.classList.toggle("on", entry.band === selectedBand);
      chip.classList.toggle("muted", !entry.band.on);
      chip.dataset.index = index;
      const number = makeElement("i", { text: index + 1 });
      number.style.background = typeColor[entry.band.type];
      chip.append(number, formatHz(entry.band.frequencyHz));
      track.append(chip);
    });

    const add = makeElement("button", { className: "chip add", text: "Add band", title: `Make a new band in ${layerLabels[role]}` });
    add.dataset.add = role;
    track.append(add);
    const label = makeElement("span", { className: "chip-label", text: layerLabels[role] });
    label.style.color = layerColor[role];
    const row = makeElement("div", { className: "chip-row" });
    row.append(label, track);
    host.append(row);
  }
}

/**
 * @param {Band} band
 * @returns {string}
 */
function describeQ(band) {
  if (band.type === "PK") return `Q, ${qToOctaves(band.q).toFixed(1)} octaves wide`;
  if (bandTypeDetails[band.type].node.endsWith("shelf")) return "Q, not used by a shelf yet";
  return "Q";
}

function renderInspector() {
  const index = readSelectedIndex();
  const band = selectedBand;
  const isChosen = index >= 0;
  byId("inspectorEmpty").hidden = isChosen;
  byId("inspectorBody").hidden = !isChosen;
  if (!isChosen) return;

  const title = byId("bandTitle");
  title.textContent = `${layerLabels[readSelectedRole()]} · ${index + 1}. ${bandTypeDetails[band.type].label}`;
  title.style.color = typeColor[band.type];
  setField("bandType", band.type);
  // The segment buttons hold the common types. The others are under More.
  const isCommon = Boolean(byId("bandSegments").querySelector(`[data-type="${band.type}"]`));
  byId("bandType").hidden = isCommon && !isMoreOpen;
  byId("moreTypes").classList.toggle("on", !byId("bandType").hidden);
  for (const button of byId("bandSegments").querySelectorAll("[data-type]")) {
    button.classList.toggle("on", button.dataset.type === band.type);
  }
  byId("bandOn").textContent = band.on ? "On" : "Off";
  byId("bandOn").classList.toggle("on", band.on);
  byId("bandSolo").classList.toggle("on", soloBand === band);

  setField("frequencyInput", Math.round(band.frequencyHz));
  setField("gainInput", formatDb(band.gainDb));
  setField("qInput", band.q.toFixed(2));
  byId("gainInput").disabled = !hasGain(band.type);
  byId("qHint").textContent = describeQ(band);
}

function renderTable() {
  const head = makeElement("tr");
  for (const label of ["Band", "Hz", "dB", "Q"]) head.append(makeElement("th", { text: label }));
  const rows = listBandEntries().map(({ band }, index) => {
    const row = makeElement("tr");
    row.dataset.index = index;
    row.classList.toggle("on", band === selectedBand);
    const number = makeElement("span", { className: "number", text: index + 1 });
    number.style.color = typeColor[band.type];
    const typeCell = makeElement("td");
    typeCell.append(number, bandTypeDetails[band.type].label);
    row.append(typeCell);

    const gain = hasGain(band.type) ? formatDb(band.gainDb) : "";
    for (const value of [Math.round(band.frequencyHz), gain, band.q.toFixed(2)]) row.append(makeElement("td", { text: value }));
    return row;
  });
  byId("table").replaceChildren(head, ...rows);
}

/** @param {string} name */
function showTab(name) {
  byId("app").dataset.showing = name;
  for (const button of byId("tabs").children) button.classList.toggle("on", button.dataset.tab === name);
  chrome.storage.local.set({ tab: name });
}

function renderPills() {
  for (const button of byId("zoom").querySelectorAll("[data-zoom]")) {
    button.classList.toggle("on", button.dataset.zoom === tuneGraph.zoom);
  }
  byId("tall").classList.toggle("on", tuneGraph.isTall);
}

/**
 * @param {LayerRole} role
 * @returns {boolean}
 */
function isSavedPreset(role) {
  const layer = config.layers[role];
  return Boolean(layer) && layer.source === layerSources.saved && Boolean(presets[role][layer.name]);
}

// Each Library section shows what plays in its layer now, and whether that is one of your presets.
/** @param {LayerRole} role */
function renderPresetCard(role) {
  const layer = config.layers[role];
  const isSaved = isSavedPreset(role);
  let caption = "Nothing yet";
  if (layer) caption = isSaved ? "Your preset" : `${layer.source}, not saved yet`;
  partOf(role, "current-caption").textContent = caption;
  partOf(role, "current-name").textContent = layer ? describeLayerName(layer) : "No ear tuning";

  const save = partOf(role, "save");
  const hasNothingNew = isSaved && !layer.isEdited;
  save.textContent = isSaved ? "Save changes" : "Save";
  save.disabled = !layer || hasNothingNew;
  partOf(role, "save-as").disabled = !layer;
  for (const item of sectionOf(role).querySelectorAll(".item[data-name]")) {
    item.classList.toggle("on", Boolean(layer) && item.dataset.name === layer.name);
  }
}

function renderPresetCards() {
  for (const role of layerOrder) renderPresetCard(role);
}

/** @param {LayerRole} role */
function storePresets(role) {
  chrome.storage.local.set({ [`${role}Presets`]: presets[role] });
  renderList[role]();
}

/**
 * @param {LayerRole} role
 * @param {string} name
 */
function savePreset(role, name) {
  const layer = config.layers[role];
  const isUpdate = Boolean(presets[role][name]);
  presets[role][name] = { bands: structuredClone(layer.bands) };
  layer.name = name;
  layer.source = layerSources.saved;
  layer.isEdited = false;
  closeLibraryAction(role);
  commit();
  storePresets(role);
  showHint(role, `${isUpdate ? "Updated" : "Saved"} ${name}.`);
}

/**
 * @param {LayerRole} role
 * @param {string} name
 */
function deletePreset(role, name) {
  delete presets[role][name];
  // The layer keeps its bands. It is no longer a saved preset, so Save asks for a name again.
  const layer = config.layers[role];
  const isPlaying = Boolean(layer) && layer.source === layerSources.saved && layer.name === name;
  if (isPlaying) layer.source = layerSources.deleted;
  commit();
  storePresets(role);
}

/**
 * @param {AutoEqItem} item
 * @param {HTMLElement} hint
 * @param {string} [target]
 * @returns {Promise<boolean>}
 */
async function loadHeadphone(item, hint, target) {
  hint.textContent = `Loading ${item.name}...`;
  const headphone = await fetchHeadphone(item, targetData, target);
  if (!headphone) {
    hint.textContent = `${item.name} did not load. Check the network and try again.`;
    return false;
  }
  replaceLayer({ ...headphone, name: item.name, source: layerSources.autoEq }, "headphone");
  hint.textContent = "";

  return true;
}

// A change of target loads the headphone again with the new target. Edits to its bands are lost.
/** @param {string} target */
function changeTarget(target) {
  const { name, path } = config.layers.headphone.autoEq;
  loadHeadphone(makeAutoEqItem(name, path), partOf("headphone", "search-hint"), target);
}

// A pick from a typed search is the end of that search. The box empties and Listen shows the sound.
function endHeadphoneSearch() {
  const box = partOf("headphone", "search");
  if (box.value.trim() === "") return;
  box.value = "";
  renderHeadphoneList();
  showTab("listen");
}

/**
 * @param {string} label
 * @param {string} detail
 * @param {() => void} onPick
 * @param {() => void} [onRemove]
 * @returns {HTMLElement}
 */
function makeResultItem(label, detail, onPick, onRemove) {
  const button = makeElement("button", { className: "item" });
  button.dataset.name = label;
  button.append(makeElement("span", { text: label }), makeElement("small", { text: detail }));
  button.addEventListener("click", onPick);
  if (!onRemove) return button;

  const remove = makeElement("button", { className: "remove", text: "×", title: `Delete ${label}` });
  remove.addEventListener("click", onRemove);
  const row = makeElement("div", { className: "result-row" });
  row.append(button, remove);

  return row;
}

/**
 * @param {LayerRole} role
 * @param {string} name
 * @param {() => void} onPlaced
 * @returns {HTMLElement}
 */
function makePresetItem(role, name, onPlaced) {
  const { bands } = presets[role][name];
  const place = () => {
    replaceLayer({ name, source: layerSources.saved, bands }, role);
    onPlaced();
  };

  return makeResultItem(name, describeBandCount(bands), place, () => deletePreset(role, name));
}

/**
 * @param {AutoEqItem} item
 * @param {HTMLElement} hint
 * @returns {HTMLElement}
 */
function makeMeasurementItem(item, hint) {
  const detail = describeMeasurement(item, findFamily(targetData.families, item));
  const row = makeResultItem(item.name, detail, async () => {
    if (await loadHeadphone(item, hint)) endHeadphoneSearch();
  });
  row.classList.add("measurement");
  if (item.isAutoEqPick) {
    row.firstChild.append(makeElement("em", { className: "pick", text: "AutoEQ's pick", title: "AutoEQ recommends this measurement of the headphone" }));
  }

  return row;
}

/**
 * @param {HTMLElement} list
 * @param {string} title
 * @param {HTMLElement[]} items
 */
function appendSection(list, title, items) {
  if (items.length === 0) return;
  list.append(makeElement("h4", { text: title }), ...items);
}

/**
 * @param {string} query
 * @param {HTMLElement} hint
 * @returns {Promise<AutoEqItem[]>}
 */
async function findHeadphones(query, hint) {
  hint.textContent = "Searching AutoEQ...";
  const items = await loadAutoEqIndex().catch(() => null);
  hint.textContent = items ? "" : "The AutoEQ list did not load. Check the network.";

  return (items || []).filter((item) => item.name.toLowerCase().includes(query)).slice(0, maxResultCount);
}

/**
 * @param {HTMLElement} list
 * @param {{ saved: HTMLElement[], autoEq: HTMLElement[], starter: HTMLElement[] }} sections
 */
function showHeadphoneList(list, sections) {
  list.replaceChildren();
  appendSection(list, "Your headphone presets", sections.saved);
  appendSection(list, "AutoEQ headphones", sections.autoEq);
  appendSection(list, "Starter sounds", sections.starter);
  renderPresetCards();
}

// An empty box lists your headphone presets and the starter sounds. Typing also searches AutoEQ.
async function renderHeadphoneList() {
  const list = partOf("headphone", "results");
  const hint = partOf("headphone", "search-hint");
  const query = partOf("headphone", "search").value.trim().toLowerCase();
  // A slower search for an older query must not draw over the newer one.
  list.dataset.query = query;
  /**
   * @param {string} name
   * @returns {boolean}
   */
  const matches = (name) => name.toLowerCase().includes(query);

  const saved = Object.keys(presets.headphone).filter(matches).map((name) => makePresetItem("headphone", name, endHeadphoneSearch));
  if (saved.length === 0 && query === "") {
    saved.push(makeElement("p", { className: "hint", text: "Nothing saved yet. Pick your headphone, then press Save." }));
  }
  const starter = starterPresets.filter((preset) => matches(preset.name)).map((preset) => {
    const place = () => {
      replaceLayer({ name: preset.name, source: layerSources.starter, bands: preset.bands }, "headphone");
      endHeadphoneSearch();
    };
    return makeResultItem(preset.name, describeBandCount(preset.bands), place);
  });

  // Your presets and the starter sounds show at once. The AutoEQ list joins once it loads.
  showHeadphoneList(list, { saved, autoEq: [], starter });
  hint.textContent = "";
  if (query.length < minQueryLength) return;

  const headphones = await findHeadphones(query, hint);
  if (list.dataset.query !== query) return;
  showHeadphoneList(list, { saved, autoEq: headphones.map((item) => makeMeasurementItem(item, hint)), starter });
  if (list.children.length === 0) hint.textContent = "No sound by that name.";
}

function renderEarList() {
  const list = partOf("ear", "results");
  const items = Object.keys(presets.ear).map((name) => makePresetItem("ear", name, () => {}));
  if (items.length === 0) {
    items.push(makeElement("p", { className: "hint", text: "Nothing saved yet. Run the test, paste the result, then press Save." }));
  }
  const turnOff = makeResultItem("No ear tuning", "Headphone only", removeEarLayer);
  list.replaceChildren();
  appendSection(list, "Your ear presets", items);
  list.append(turnOff);
  renderPresetCards();
}

const renderList = { headphone: renderHeadphoneList, ear: renderEarList };

/**
 * @param {LayerRole} role
 * @param {string} text
 * @param {string} name
 * @param {string} source
 */
function applyAutoEqText(role, text, name, source) {
  const parsed = parseAutoEq(text);
  if (parsed.bands.length === 0) {
    showHint(role, "No AutoEQ filters found in that text.");
    return;
  }
  replaceLayer({ name, source, bands: parsed.bands, preampDb: parsed.preampDb }, role);
  showHint(role, `Applied ${describeBandCount(parsed.bands)} to ${layerLabels[role]}. Press Save to keep it.`);
}

/**
 * @param {LayerRole} role
 * @returns {string}
 */
function readSaveName(role) {
  return partOf(role, "save-name").value.trim();
}

/** @param {LayerRole} role */
function renderConfirmSaveLabel(role) {
  partOf(role, "confirm-save").textContent = presets[role][readSaveName(role)] ? "Replace" : "Save";
}

/**
 * @param {LayerRole} role
 * @param {string} action
 */
function fillSaveName(role, action) {
  // Save fills in the current name, so an AutoEQ pick saves under its headphone name.
  partOf(role, "save-name").value = action === "save" ? config.layers[role].name : "";
  renderConfirmSaveLabel(role);
  partOf(role, "save-name").focus();
}

/** @param {LayerRole} role */
function fillExportText(role) {
  const bands = readBands(config.layers[role]);
  partOf(role, "text").value = toAutoEq({ preampDb: autoPreampDb(bands), bands });
  showHint(role, `${layerLabels[role]} alone, as AutoEQ text. Copy it out.`);
}

/** @param {LayerRole} role */
function emptyPasteBox(role) {
  const text = partOf(role, "text");
  text.value = "";
  text.focus();
}

const fillActionRow = { save: fillSaveName, saveAs: fillSaveName, export: fillExportText, paste: emptyPasteBox };

// Each section button opens its own row. A second press on the same button closes it.
/**
 * @param {LayerRole} role
 * @param {string} action
 */
function toggleLibraryAction(role, action) {
  const openAction = openActions[role] === action ? "" : action;
  openActions[role] = openAction;
  partOf(role, "save-row").hidden = openAction !== "save" && openAction !== "saveAs";
  partOf(role, "drawer").hidden = openAction !== "paste" && openAction !== "export";
  partOf(role, "apply").hidden = openAction !== "paste";
  for (const button of partOf(role, "library-actions").children) button.classList.toggle("on", button.dataset.action === openAction);
  showHint(role, "");
  if (openAction) fillActionRow[openAction](role, openAction);
}

/** @param {LayerRole} role */
function closeLibraryAction(role) {
  if (openActions[role]) toggleLibraryAction(role, openActions[role]);
}

const libraryActions = {
  save: (role) => {
    if (isSavedPreset(role)) savePreset(role, config.layers[role].name);
    else toggleLibraryAction(role, "save");
  },
  saveAs: (role) => toggleLibraryAction(role, "saveAs"),
  confirmSave: (role) => {
    const name = readSaveName(role);
    if (name) savePreset(role, name);
    else showHint(role, "Give the preset a name first.");
  },
  import: (role) => partOf(role, "import-file").click(),
  paste: (role) => toggleLibraryAction(role, "paste"),
  export: (role) => toggleLibraryAction(role, "export"),
  apply: (role) => applyAutoEqText(role, partOf(role, "text").value, pastedNames[role], layerSources.pasted),
  // The test measures what you hear, so My ear comes off first. The headphone layer stays on.
  measure: () => {
    if (config.layers.ear) config.layers.ear.on = false;
    commit();
    chrome.tabs.create({ url: "https://eqbyear.com" });
    showHint("ear", "eqbyear is open in a new tab, with My ear off. Click the goui icon on that tab, run the test, then Paste the result here.");
  },
};

/** @param {import("./shared/messages.js").CaptureState} state */
function applyCaptureState(state) {
  const isCapturing = Boolean(state.isCapturing);
  // The first tab goui hears ends the guide for good.
  if (isCapturing && byId("app").dataset.started === "no") {
    byId("app").dataset.started = "yes";
    chrome.storage.local.set({ hasCaptured: true });
  }
  const status = byId("status");
  status.textContent = state.error || (isCapturing ? state.title : idleInstruction);
  status.classList.toggle("instruction", !isCapturing);
  status.title = isCapturing && !isPopup ? "Click the goui icon on this tab to turn goui off, or on another tab to move it there." : "";

  isPopupTabHeard = isCapturing && state.tabId === popupTabId;
  byId("powerText").textContent = isPopupTabHeard ? "ON" : "OFF";
  byId("power").setAttribute("aria-pressed", String(isPopupTabHeard));
  byId("power").title = isPopupTabHeard ? "Turn goui off on this tab" : "Turn goui on for this tab";
}

/** @param {{ levelDb: number, spectrumDb: number[] }} message */
function applyTelemetry(message) {
  byId("level").textContent = message.levelDb <= silenceDb ? "--" : message.levelDb.toFixed(1);
  // Each reading is raw. Blending with the last frame keeps the spectrum calm to look at.
  const newShare = 0.3;
  const previous = spectrumDb;
  spectrumDb = message.spectrumDb.map((levelDb, index) => (previous.length ? ((1 - newShare) * previous[index]) + (newShare * levelDb) : levelDb));
  for (const graph of graphs) graph.renderSpectrum();
}

/** @param {boolean} isOn */
function setComparing(isOn) {
  if (isComparing === isOn) return;
  isComparing = isOn;
  byId("compare").classList.toggle("on", isOn);
  sendAudio();
  refresh();
}

// Turning Auto off keeps the value Auto had, so the sound does not jump.
function toggleAutoPreamp() {
  if (config.autoPreamp) config.preampDb = makePlayedSound(config).preampDb;
  config.autoPreamp = !config.autoPreamp;
  commit();
}

/** @param {HTMLInputElement} slider */
function readSlider(slider) {
  const valueDb = Number(slider.value);
  if (slider.id === "preamp") {
    config.autoPreamp = false;
    config.preampDb = valueDb;
  } else {
    config.sliders[`${slider.id}Db`] = valueDb;
  }
  commit();
}

const bandSteps = {
  frequency: (band, direction) => setBandFrequency(band, band.frequencyHz * (2 ** (direction / semitonesPerOctave))),
  gain: (band, direction) => setBandGain(band, band.gainDb + (direction * gainStepDb)),
  q: (band, direction) => setBandQ(band, band.q * (qStepRatio ** direction)),
};

const bandFieldSetters = {
  frequencyInput: setBandFrequency,
  gainInput: setBandGain,
  qInput: setBandQ,
};

/**
 * @param {LayerRole} role
 * @param {File} file
 */
async function importFile(role, file) {
  const dot = file.name.lastIndexOf(".");
  const name = dot > 0 ? file.name.slice(0, dot) : file.name;
  applyAutoEqText(role, await file.text(), name, layerSources.file);
}

function wireHeader() {
  byId("tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (button) showTab(button.dataset.tab);
  });
  for (const id of ["help", "guide", "credits"]) {
    byId(id).addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("src/intro.html") }));
  }
  byId("compare").addEventListener("pointerdown", () => setComparing(true));
  byId("compare").addEventListener("pointerup", () => setComparing(false));
  byId("compare").addEventListener("pointerleave", () => setComparing(false));
  byId("enabled").addEventListener("change", (event) => {
    config.enabled = event.target.checked;
    commit();
  });
}

function wireListen() {
  byId("sliders").addEventListener("input", (event) => {
    if (event.target.type === "range") readSlider(event.target);
  });
  byId("levelMatch").addEventListener("change", (event) => {
    isLevelMatched = event.target.checked;
    chrome.storage.local.set({ isLevelMatched });
  });
  byId("autoPreamp").addEventListener("click", toggleAutoPreamp);
  byId("exportAll").addEventListener("click", () => {
    const whole = byId("wholeText");
    whole.hidden = false;
    whole.value = toAutoEq({ preampDb: makePlayedSound(config).preampDb, bands: listExportBands(config) });
  });
}

function wireGraphButtons() {
  byId("zoom").addEventListener("click", (event) => {
    const button = event.target.closest("[data-zoom]");
    if (button) for (const graph of graphs) graph.setZoom(button.dataset.zoom);
    renderPills();
  });
  byId("tall").addEventListener("click", () => {
    const isTall = !tuneGraph.isTall;
    for (const graph of graphs) graph.setTall(isTall);
    chrome.storage.local.set({ view: isTall ? "tall" : "wide" });
    renderPills();
  });
}

function wireTune() {
  byId("chips").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-index], [data-add]");
    if (!chip) return;
    if (chip.dataset.add) {
      addBandToLayer(chip.dataset.add, newBandFrequencyHz, 0);
      return;
    }
    // A second press on the chosen chip unselects it.
    const index = Number(chip.dataset.index);
    selectBand(index === readSelectedIndex() ? -1 : index);
  });
  byId("table").addEventListener("click", (event) => {
    const row = event.target.closest("[data-index]");
    if (row) selectBand(Number(row.dataset.index));
  });
  byId("inspector").addEventListener("click", (event) => {
    const button = event.target.closest("[data-step]");
    if (!button) return;
    bandSteps[button.dataset.step](selectedBand, Number(button.dataset.direction));
    commitBandEdit();
  });
  byId("inspector").addEventListener("input", (event) => {
    const setBandField = bandFieldSetters[event.target.id];
    if (!setBandField) return;
    setBandField(selectedBand, Number(event.target.value.replace(",", ".")));
    commitBandEdit();
  });
  byId("bandSegments").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.id === "moreTypes") {
      isMoreOpen = !isMoreOpen;
      renderInspector();
      return;
    }
    selectedBand.type = button.dataset.type;
    commitBandEdit();
  });
  byId("bandType").addEventListener("change", (event) => {
    selectedBand.type = event.target.value;
    commitBandEdit();
  });
  byId("bandOn").addEventListener("click", () => {
    selectedBand.on = !selectedBand.on;
    commitBandEdit();
  });
  byId("bandSolo").addEventListener("click", () => {
    soloBand = soloBand === selectedBand ? null : selectedBand;
    commit();
  });
  byId("bandDelete").addEventListener("click", deleteSelectedBand);
}

function wireLibrary() {
  for (const role of layerOrder) {
    sectionOf(role).addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (button) libraryActions[button.dataset.action](role);
    });
    partOf(role, "save-name").addEventListener("input", () => renderConfirmSaveLabel(role));
    partOf(role, "save-name").addEventListener("keydown", (event) => {
      if (event.key === "Enter") libraryActions.confirmSave(role);
    });
    partOf(role, "import-file").addEventListener("change", (event) => {
      const [file] = event.target.files;
      event.target.value = "";
      if (file) importFile(role, file);
    });
  }
  partOf("headphone", "search").addEventListener("input", debounce(renderHeadphoneList, typingPauseMs));
}

// The service worker starts a tab with the stored config, so an open panel sends the A/B and Solo it shows.
function wireMessages() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === messageTypes.captureState) {
      applyCaptureState(message.state);
      if (message.state.isCapturing) sendAudio();
    }
    if (message && message.type === messageTypes.audioTelemetry) applyTelemetry(message);
    return false;
  });
}

async function readPresets(stored) {
  for (const role of layerOrder) {
    const storedPresets = stored[`${role}Presets`] || {};
    for (const [name, preset] of Object.entries(storedPresets)) presets[role][name] = { bands: cleanBands(preset && preset.bands) };
  }
  const olderSounds = stored.savedSounds || stored.presets;
  if (!olderSounds) return;

  // An older sound becomes a headphone preset, and an ear preset when it has ear bands. A preset of that name wins.
  for (const [name, sound] of Object.entries(olderSounds)) {
    const layers = sanitizeConfig(sound).layers;
    presets.headphone[name] ??= { bands: layers.headphone.bands };
    const hasEarBands = Boolean(layers.ear) && layers.ear.bands.length > 0;
    if (hasEarBands) presets.ear[name] ??= { bands: layers.ear.bands };
  }
  // The old key goes only once the new lists are written, so a failed write loses nothing.
  await chrome.storage.local.set({ headphonePresets: presets.headphone, earPresets: presets.ear });
  await chrome.storage.local.remove(["savedSounds", "presets"]);
}

// The slider limits come from the same numbers that clean a stored config.
function setSliderRanges() {
  const ranges = { bass: sliderRangeDb, vocals: sliderRangeDb, treble: sliderRangeDb, preamp: preampRangeDb };
  for (const [id, [minDb, maxDb]] of Object.entries(ranges)) Object.assign(byId(id), { min: minDb, max: maxDb });
}

// Opening the popup counts as the click on the icon, so goui starts on its tab right away.
function startPopup() {
  document.documentElement.classList.add("popup");
  byId("power").hidden = false;
  const start = { type: messageTypes.captureStart, tabId: popupTabId };
  byId("power").addEventListener("click", () => trySendMessage(isPopupTabHeard ? { type: messageTypes.captureStop } : start));
  trySendMessage(start);
}

async function startPanel() {
  for (const type of bandTypes) byId("bandType").append(new Option(bandTypeDetails[type].label, type));
  setSliderRanges();

  targetData = await loadTargets();
  const stored = await chrome.storage.local.get(storedKeys);
  byId("app").dataset.started = stored.hasCaptured ? "yes" : "no";
  // goui 0.1.4 stored Level match as keepsPreampInCompare and the tall view as "vertical".
  isLevelMatched = (stored.isLevelMatched ?? stored.keepsPreampInCompare) === true;
  byId("levelMatch").checked = isLevelMatched;
  if (stored.config) config = sanitizeConfig(stored.config);
  await readPresets(stored);
  for (const graph of graphs) graph.setTall(stored.view === "tall" || stored.view === "vertical");
  showTab(stored.tab || "listen");
  renderPills();
  sendAudio();
  refresh();
  renderHeadphoneList();
  renderEarList();

  const session = await chrome.storage.session.get("capture");
  applyCaptureState(session.capture || { isCapturing: false });
  if (isPopup) startPopup();
}

wireHeader();
wireListen();
wireGraphButtons();
wireTune();
wireLibrary();
wireMessages();
startPanel();

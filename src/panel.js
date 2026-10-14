import {
  audioNodeType,
  autoPreampDb,
  bandTypes,
  butterworthQ,
  cleanBands,
  defaultConfig,
  flatSliders,
  hasGain,
  layerLabels,
  layerOrder,
  listExportBands,
  listOnLayers,
  listPlayedBands,
  makeLayer,
  makePlayedSound,
  maxBoostDb,
  newBand,
  parseAutoEq,
  preampRangeDb,
  qStepRatio,
  qToOctaves,
  sanitizeConfig,
  setBandFrequency,
  setBandGain,
  setBandQ,
  sliderRangeDb,
  toAutoEq,
  typeLabels,
} from "./shared/filters.js";
import { messageTypes, silenceDb, trySendMessage } from "./shared/messages.js";
import { fitTargetChange } from "./fit.js";
import { formatDb, formatHz, layerColor, makeGraph, typeColor } from "./graph.js";

/** @typedef {import("./shared/filters.js").Band} Band */

/** @typedef {import("./shared/filters.js").Layer} Layer */

/** @typedef {import("./shared/filters.js").LayerRole} LayerRole */

/** @typedef {import("./shared/filters.js").LayerBands} LayerBands */

/** @typedef {import("./graph.js").BandEntry} BandEntry */

/** @typedef {{ name: string, path: string, source: string, form: string, rig: string, isAutoEqPick: boolean }} AutoEqItem */

/** @typedef {{ labels: string[], measurements: { source: string, form: string, rig?: string }[] }} RigFamily */

/** @typedef {import("./fit.js").TargetCurve} TargetCurve */

/** @typedef {{ families: RigFamily[], targets: TargetCurve[] }} TargetData */

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
const byId = (id) => document.getElementById(id);
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
const autoEqBase = "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/";
// The source a layer shows once it matches one of your presets.
const savedSource = "Saved";

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

let config = defaultConfig();
// Each layer has its own list of presets. A preset holds bands only. The sliders and the preamp
// stay as they are when you pick one.
const presets = { headphone: {}, ear: {} };
let spectrumDb = [];
let selectedIndex = -1;
let soloIndex = -1;
let isComparing = false;
let isLevelMatched = false;
let autoEqItems = null;
/** @type {Promise<TargetData> | null} */
let targetData = null;
// The same data once it has loaded, for the Listen row, which draws at once.
/** @type {TargetData | null} */
let loadedTargets = null;
let isMoreOpen = false;
const openActions = { headphone: "", ear: "" };

// Every band in the panel, in layer order, with the layer it belongs to. A layer that is off keeps
// its bands, so they can still be edited while it is silent.
/** @returns {BandEntry[]} */
function listBandEntries() {
  return layerOrder.flatMap((role) => {
    const layer = config.layers[role];
    return layer ? layer.bands.map((band) => ({ role, band })) : [];
  });
}

/**
 * @param {number} index
 * @returns {Band | undefined}
 */
function bandAt(index) {
  const entry = listBandEntries()[index];
  return entry && entry.band;
}

/**
 * @param {number} index
 * @returns {LayerRole | undefined}
 */
function roleAt(index) {
  const entry = listBandEntries()[index];
  return entry && entry.role;
}

// Holding A/B and the main switch both silence the EQ. The graph then draws a flat line.
/** @returns {boolean} */
function isEqOff() {
  return isComparing || !config.enabled;
}

/**
 * @param {(layer: Layer) => Layer} change
 * @returns {{ headphone: Layer, ear?: Layer }}
 */
function mapLayers(change) {
  const layers = {};
  for (const role of layerOrder) if (config.layers[role]) layers[role] = change(config.layers[role]);
  return layers;
}

// Level match plays the preamp the EQ uses with every band off. Auto would set 0 dB for no bands.
/** @returns {import("./shared/filters.js").Config} */
function makePreampOnlyConfig() {
  const layers = mapLayers((layer) => ({ ...layer, on: false }));
  return { ...config, layers, sliders: flatSliders, autoPreamp: false, preampDb: makePlayedSound(config).preampDb };
}

/**
 * @param {Band} soloed
 * @returns {import("./shared/filters.js").Config}
 */
function makeSoloConfig(soloed) {
  const layers = mapLayers((layer) => ({ ...layer, on: true, bands: layer.bands.map((band) => ({ ...band, on: band === soloed })) }));
  return { ...config, layers, sliders: flatSliders };
}

// The config the engine plays and the graph draws, with A/B and Solo applied. A/B wins over Solo.
/** @returns {import("./shared/filters.js").Config} */
function makeHeardConfig() {
  if (isComparing) return isLevelMatched ? makePreampOnlyConfig() : { ...config, enabled: false };
  const soloed = bandAt(soloIndex);
  return soloed ? makeSoloConfig(soloed) : config;
}

/** @returns {Band[]} */
function listCurveBands() {
  const heard = makeHeardConfig();
  return heard.enabled ? listPlayedBands(heard) : [];
}

// Each layer's own curve, for the dashed lines under the total. Solo and A/B draw none.
/** @returns {LayerBands[]} */
function listCurveLayers() {
  const isSoloing = Boolean(bandAt(soloIndex));
  return isEqOff() || isSoloing ? [] : listOnLayers(config);
}

// Solo ends with the choice. Solo is kept as a position, so after a delete it would name another band.
function unselectBand() {
  selectedIndex = -1;
  soloIndex = -1;
}

function removeEarLayer() {
  delete config.layers.ear;
  unselectBand();
  commit();
}

/**
 * @param {LayerRole} role
 * @param {number} frequencyHz
 * @param {number} gainDb
 */
function addBandToLayer(role, frequencyHz, gainDb) {
  config.layers[role] ??= makeLayer("My ear tuning", "Your bands");
  const band = { ...newBand(frequencyHz), gainDb };
  config.layers[role].bands.push(band);
  selectedIndex = listBandEntries().findIndex((entry) => entry.band === band);
  commitEdit(role);
}

/** @type {import("./graph.js").GraphHooks} */
const graphHooks = {
  listBandEntries,
  listCurveBands,
  listCurveLayers,
  readSpectrumDb: () => spectrumDb,
  readSelectedIndex: () => selectedIndex,
  isEqOff,
  selectBand: (index) => {
    selectedIndex = index;
    refresh();
  },
  commitBandEdit: () => commitEdit(),
  // A new band joins the layer of the selected band. With none selected it joins the headphone layer.
  addBand: (frequencyHz, gainDb) => addBandToLayer(roleAt(selectedIndex) || "headphone", frequencyHz, gainDb),
};

// The Listen graph is a preview. It matches the Tune graph in size and follows its zoom and turn.
const graphHeights = { height: 210, tallHeight: 440 };
const listenGraph = makeGraph(byId("listenGraph"), { ...graphHeights, interactive: false, regions: true, layerCurves: true }, graphHooks);
const tuneGraph = makeGraph(byId("tuneGraph"), { ...graphHeights, interactive: true, layerCurves: true }, graphHooks);
const graphs = [listenGraph, tuneGraph];

function sendAudio() {
  trySendMessage({ type: messageTypes.audioConfig, config: makeHeardConfig() });
}

const storageWaitMs = 120;
const storeConfig = debounce(() => chrome.storage.local.set({ config }), storageWaitMs);

// The sound follows every edit at once. Only the storage write waits for the edits to pause.
function commit() {
  sendAudio();
  storeConfig();
  refresh();
}

// A change to a layer's bands. Its row then says the sound differs from the one you picked. Pass
// null for a change that belongs to the sliders or the preamp, which no layer owns.
/** @param {LayerRole | null} [role] */
function commitEdit(role) {
  const markedRole = role === null ? null : role || roleAt(selectedIndex);
  if (markedRole && config.layers[markedRole]) config.layers[markedRole].isEdited = true;
  commit();
}

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

/** @param {LayerRole} role */
function openLibrarySection(role) {
  showTab("library");
  sectionOf(role).scrollIntoView({ block: "start" });
}

// The targets a headphone from AutoEQ can take. A family with one target shows its name only.
/**
 * @param {import("./shared/filters.js").AutoEqOrigin} autoEq
 * @returns {HTMLElement}
 */
function makeTargetChoice(autoEq) {
  const family = loadedTargets && findFamily(loadedTargets.families, { ...readMeasurement(autoEq.path), name: autoEq.name, path: autoEq.path, isAutoEqPick: false });
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

// The stack on Listen. One row per layer, each with its own switch, its source and its name.
function renderLayers() {
  const host = byId("layers");
  host.replaceChildren();
  for (const role of layerOrder) {
    const layer = config.layers[role];
    if (!layer) continue;
    const row = makeElement("div", { className: layer.on ? "layer" : "layer off" });

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
    change.dataset.role = role;
    change.addEventListener("click", () => openLibrarySection(role));

    row.append(toggle, text, change);
    if (role === "ear") {
      const remove = makeElement("button", { text: "×", title: "Take the ear layer off" });
      remove.addEventListener("click", removeEarLayer);
      row.append(remove);
    }
    host.append(row);
  }

  if (!config.layers.ear) {
    const add = makeElement("button", {
      text: "Add your ear tuning on top",
      title: "Open My ear in the Library, to paste an eqbyear result or pick a saved ear preset",
    });
    add.id = "addEar";
    add.addEventListener("click", () => {
      openLibrarySection("ear");
      if (openActions.ear !== "paste") toggleLibraryAction("ear", "paste");
    });
    host.append(add);
  }
}

function renderSound() {
  const engine = makePlayedSound(config);
  byId("enabled").checked = config.enabled;

  for (const name of ["bass", "vocals", "treble"]) {
    setField(name, config.sliders[`${name}Db`]);
    byId(`${name}Value`).textContent = `${formatDb(config.sliders[`${name}Db`])} dB`;
  }

  setField("preamp", engine.preampDb.toFixed(1));
  byId("preampValue").textContent = `${formatDb(engine.preampDb)} dB`;
  byId("autoPreamp").classList.toggle("on", config.autoPreamp);
  byId("preampNote").textContent = config.autoPreamp ? "Auto" : "Manual";

  // A rounding margin, so a boost that auto preamp offsets exactly never shows red.
  const clipMarginDb = 0.05;
  const headroomDb = maxBoostDb(engine.bands) + engine.preampDb;
  const isClipping = config.enabled && headroomDb > clipMarginDb;
  byId("clip").classList.toggle("red", isClipping);
  byId("meter").title = isClipping ? `The EQ can clip by ${headroomDb.toFixed(1)} dB. Turn the preamp down or press Auto.` : "Output level. No clipping.";
}

// One row per layer, each with its own label and its own Add band chip.
function renderChips() {
  const host = byId("chips");
  host.replaceChildren();
  let index = 0;
  for (const role of layerOrder) {
    const row = makeElement("div", { className: "chip-row" });
    const label = makeElement("span", { className: "chip-label", text: layerLabels[role] });
    label.style.color = layerColor[role];
    const track = makeElement("div", { className: "chip-track" });

    const layer = config.layers[role];
    for (const band of layer ? layer.bands : []) {
      const chip = makeElement("button", { className: "chip" });
      chip.classList.toggle("on", index === selectedIndex);
      chip.classList.toggle("muted", !band.on);
      chip.dataset.index = index;
      const number = makeElement("i", { text: index + 1 });
      number.style.background = typeColor[band.type];
      chip.append(number, formatHz(band.frequencyHz));
      track.append(chip);
      index += 1;
    }

    const add = makeElement("button", { className: "chip add", text: "Add band", title: `Make a new band in ${layerLabels[role]}` });
    add.dataset.add = role;
    track.append(add);
    row.append(label, track);
    host.append(row);
  }
}

function describeQ(band) {
  if (band.type === "PK") return `Q, ${qToOctaves(band.q).toFixed(1)} octaves wide`;
  if (audioNodeType[band.type].endsWith("shelf")) return "Q, not used by a shelf yet";
  return "Q";
}

function renderInspector() {
  const band = bandAt(selectedIndex);
  byId("inspectorEmpty").hidden = Boolean(band);
  byId("inspectorBody").hidden = !band;
  if (!band) return;

  const title = byId("bandTitle");
  title.textContent = `${layerLabels[roleAt(selectedIndex)]} · ${selectedIndex + 1}. ${typeLabels[band.type]}`;
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
  byId("bandSolo").classList.toggle("on", soloIndex === selectedIndex);

  setField("frequencyInput", Math.round(band.frequencyHz));
  setField("gainInput", formatDb(band.gainDb));
  setField("qInput", band.q.toFixed(2));
  byId("gainInput").disabled = !hasGain(band.type);
  byId("qHint").textContent = describeQ(band);
}

function renderTable() {
  const table = byId("table");
  const head = makeElement("tr");
  for (const label of ["Band", "Hz", "dB", "Q"]) head.append(makeElement("th", { text: label }));
  const rows = listBandEntries().map((entry, index) => {
    const band = entry.band;
    const row = makeElement("tr");
    row.dataset.index = index;
    row.classList.toggle("on", index === selectedIndex);
    const number = makeElement("span", { className: "number", text: index + 1 });
    number.style.color = typeColor[band.type];
    const name = makeElement("td");
    name.append(number, typeLabels[band.type]);
    row.append(name);

    const gain = hasGain(band.type) ? formatDb(band.gainDb) : "";
    for (const value of [Math.round(band.frequencyHz), gain, band.q.toFixed(2)]) row.append(makeElement("td", { text: value }));
    return row;
  });
  table.replaceChildren(head, ...rows);
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
  return Boolean(layer) && layer.source === savedSource && Boolean(presets[role][layer.name]);
}

// Each Library section shows what plays in its layer now, and whether that is one of your presets.
function renderPresetCard(role) {
  const layer = config.layers[role];
  const isSaved = isSavedPreset(role);
  let caption = "Nothing yet";
  if (layer) caption = isSaved ? "Your preset" : `${layer.source}, not saved yet`;
  partOf(role, "current-caption").textContent = caption;
  partOf(role, "current-name").textContent = layer ? describeLayerName(layer) : "No ear tuning";

  const save = partOf(role, "save");
  save.textContent = isSaved ? "Save changes" : "Save";
  save.disabled = !layer || (isSaved && !layer.isEdited);
  partOf(role, "save-as").disabled = !layer;
  for (const item of sectionOf(role).querySelectorAll(".item[data-name]")) {
    item.classList.toggle("on", Boolean(layer) && item.dataset.name === layer.name);
  }
}

function renderPresetCards() {
  for (const role of layerOrder) renderPresetCard(role);
}

// A headphone file's own preamp is kept, since a lone headphone file needs it. Auto preamp
// overrides it either way.
/**
 * @param {{ name: string, source: string, bands: Band[], preampDb?: number, autoEq?: import("./shared/filters.js").AutoEqOrigin }} sound
 * @param {LayerRole} role
 */
function replaceLayer(sound, role) {
  config.layers[role] = makeLayer(sound.name, sound.source, cleanBands(sound.bands));
  if (sound.autoEq) config.layers[role].autoEq = sound.autoEq;
  if (role === "headphone" && sound.preampDb !== undefined) config.preampDb = sound.preampDb;
  unselectBand();
  commit();
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
  layer.source = savedSource;
  layer.isEdited = false;
  toggleLibraryAction(role, "");
  commit();
  storePresets(role);
  showHint(role, `${isUpdate ? "Updated" : "Saved"} ${name}.`);
}

function deletePreset(role, name) {
  delete presets[role][name];
  // The layer keeps its bands. It is no longer a saved preset, so Save asks for a name again.
  const layer = config.layers[role];
  if (layer && layer.source === savedSource && layer.name === name) layer.source = "Deleted preset";
  commit();
  storePresets(role);
}

const forms = ["over-ear", "in-ear", "earbud"];
const formLabels = { "over-ear": "Over-ear", "in-ear": "In-ear", earbud: "Earbud" };

// A path reads "source/folder/name". The folder holds the form, after the rig when the source names
// one, as in "GRAS 43AG-7 over-ear".
/**
 * @param {string} path
 * @returns {{ source: string, form: string, rig: string }}
 */
function readMeasurement(path) {
  const [source = "", folder = ""] = decodeURIComponent(path).split("/");
  const form = forms.find((each) => folder.endsWith(each)) || "";
  return { source, form, rig: folder.slice(0, folder.length - form.length).trim() };
}

/** @returns {Promise<TargetData>} */
function loadTargets() {
  targetData ??= fetch(chrome.runtime.getURL("src/targets.json")).then((response) => response.json());
  return targetData;
}

// A target only suits the rig it was made for. AutoEQ names the measurements each family suits.
/**
 * @param {RigFamily[]} families
 * @param {AutoEqItem} item
 * @returns {RigFamily | undefined}
 */
function findFamily(families, item) {
  /**
   * @param {{ source: string, form: string, rig?: string }} each
   * @returns {boolean}
   */
  const suits = (each) => each.source === item.source && each.form === item.form && (!each.rig || each.rig === item.rig);
  return families.find((family) => family.measurements.some(suits));
}

// Eight measurements of one headphone read the same by name. The source, form, rig and target tell
// them apart.
/**
 * @param {AutoEqItem} item
 * @param {RigFamily | undefined} family
 * @returns {string}
 */
function describeMeasurement(item, family) {
  const parts = [item.source];
  if (item.form) parts.push(formLabels[item.form]);
  if (item.rig) parts.push(item.rig.replace("Bruel & Kjaer", "B&K"));
  if (family) parts.push(family.labels[0]);
  return parts.join(" · ");
}

/** @returns {Promise<AutoEqItem[]>} */
async function loadAutoEqIndex() {
  if (autoEqItems) return autoEqItems;
  const cached = await chrome.storage.local.get(["autoEqIndex", "autoEqIndexAt"]);
  const indexLifetimeMs = 7 * 24 * 60 * 60 * 1000;
  const isFresh = cached.autoEqIndexAt && Date.now() - cached.autoEqIndexAt < indexLifetimeMs;
  let text = isFresh ? cached.autoEqIndex : null;
  if (!text) {
    text = await (await fetch(`${autoEqBase}INDEX.md`)).text();
    await chrome.storage.local.set({ autoEqIndex: text, autoEqIndexAt: Date.now() });
  }

  autoEqItems = [];
  const countByName = new Map();
  for (const line of text.split("\n")) {
    // A line reads "- [Name](./path) by source". The path can hold brackets of its own, such as
    // "(ANC Off)", so it runs to the last ") by ".
    const nameEnd = line.indexOf("](./");
    const pathEnd = line.lastIndexOf(") by ");
    const isEntry = line.startsWith("- [") && nameEnd > 0 && pathEnd > nameEnd;
    if (!isEntry) continue;
    const name = line.slice(3, nameEnd);
    const path = line.slice(nameEnd + 4, pathEnd);
    autoEqItems.push({ name, path, ...readMeasurement(path), isAutoEqPick: !countByName.has(name) });
    countByName.set(name, (countByName.get(name) || 0) + 1);
  }
  // The index lists the measurements of one headphone in AutoEQ's order. The first one is the one
  // AutoEQ recommends. A name with one measurement has nothing to choose between.
  for (const item of autoEqItems) item.isAutoEqPick &&= countByName.get(item.name) > 1;
  return autoEqItems;
}

// AutoEQ's file tunes the headphone to the first target of its family. Another target also plays
// the bands that move the sound from that one to it.
/**
 * @param {AutoEqItem} item
 * @param {HTMLElement} hint
 * @param {string} [target]
 * @returns {Promise<boolean>}
 */
async function loadHeadphone(item, hint, target) {
  hint.textContent = `Loading ${item.name}...`;
  const file = encodeURIComponent(`${item.name} ParametricEQ.txt`);
  const response = await fetch(`${autoEqBase}${item.path}/${file}`).catch(() => null);
  if (!response || !response.ok) {
    hint.textContent = `${item.name} did not load. Check the network and try again.`;
    return false;
  }
  const parsed = parseAutoEq(await response.text());
  const { families, targets } = await loadTargets();
  const family = findFamily(families, item);
  const autoEqTarget = family ? family.labels[0] : "";
  const chosen = family && family.labels.includes(target) ? target : autoEqTarget;
  const curveOf = (label) => targets.find((curve) => curve.label === label);
  const moveBands = chosen === autoEqTarget ? [] : fitTargetChange(curveOf(autoEqTarget), curveOf(chosen));

  const autoEq = family ? { name: item.name, path: item.path, target: chosen } : undefined;
  replaceLayer({ name: item.name, source: "AutoEQ", bands: [...parsed.bands, ...moveBands], preampDb: parsed.preampDb, autoEq }, "headphone");
  hint.textContent = "";
  return true;
}

// A change of target loads the headphone again with the new target. Edits to its bands are lost.
/** @param {string} target */
function changeTarget(target) {
  const { name, path } = config.layers.headphone.autoEq;
  loadHeadphone({ name, path, ...readMeasurement(path), isAutoEqPick: false }, partOf("headphone", "search-hint"), target);
}

// A pick from a typed search is the end of that search. The box empties and Listen shows the sound.
/** @param {() => (Promise<boolean> | void)} load */
async function pickFromSearch(load) {
  // Only a headphone download can fail. Its loader then returns false. The other loaders return nothing.
  const isLoaded = (await load()) !== false;
  const box = partOf("headphone", "search");
  const isTypedSearch = box.value.trim() !== "";
  if (!isLoaded || !isTypedSearch) return;
  box.value = "";
  renderHeadphoneList();
  showTab("listen");
}

/**
 * @param {Band[]} bands
 * @returns {string}
 */
function describeBandCount(bands) {
  return bands.length === 1 ? "1 band" : `${bands.length} bands`;
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

// A row for one of your presets. The headphone list passes its search step as `pick`, so a pick
// there also ends the search.
/**
 * @param {LayerRole} role
 * @param {string} name
 * @param {(place: () => void) => void} pick
 * @returns {HTMLElement}
 */
function makePresetItem(role, name, pick) {
  const place = () => replaceLayer({ name, source: savedSource, bands: presets[role][name].bands }, role);
  return makeResultItem(name, describeBandCount(presets[role][name].bands), () => pick(place), () => deletePreset(role, name));
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
 * @param {string} text
 * @param {HTMLElement} hint
 * @returns {Promise<AutoEqItem[]>}
 */
async function findHeadphones(text, hint) {
  hint.textContent = "Searching AutoEQ...";
  const items = await loadAutoEqIndex().catch(() => null);
  hint.textContent = items ? "" : "The AutoEQ list did not load. Check the network.";
  const maxResultCount = 20;
  return (items || []).filter((item) => item.name.toLowerCase().includes(text)).slice(0, maxResultCount);
}

// An empty box lists your headphone presets and the starter sounds. Typing also searches AutoEQ.
async function renderHeadphoneList() {
  const list = partOf("headphone", "results");
  const hint = partOf("headphone", "search-hint");
  const text = partOf("headphone", "search").value.trim().toLowerCase();
  list.dataset.query = text;
  /**
   * @param {string} name
   * @returns {boolean}
   */
  const matches = (name) => name.toLowerCase().includes(text);

  const saved = Object.keys(presets.headphone).filter(matches).map((name) => makePresetItem("headphone", name, pickFromSearch));
  if (saved.length === 0 && text === "") {
    saved.push(makeElement("p", { className: "hint", text: "Nothing saved yet. Pick your headphone, then press Save." }));
  }
  const starterItems = starterPresets.filter((sound) => matches(sound.name)).map((sound) => makeResultItem(sound.name, describeBandCount(sound.bands),
    () => pickFromSearch(() => replaceLayer({ name: sound.name, source: "Starter sound", bands: sound.bands }, "headphone"))));

  // Your presets and the starter sounds show at once. The AutoEQ list joins once it loads.
  /** @param {HTMLElement[]} headphoneItems */
  const show = (headphoneItems) => {
    list.replaceChildren();
    appendSection(list, "Your headphone presets", saved);
    appendSection(list, "AutoEQ headphones", headphoneItems);
    appendSection(list, "Starter sounds", starterItems);
    renderPresetCards();
  };
  show([]);
  hint.textContent = "";
  const minQueryLength = 2;
  if (text.length < minQueryLength) return;

  const headphones = await findHeadphones(text, hint);
  const { families } = await loadTargets();
  if (list.dataset.query !== text) return;
  show(headphones.map((item) => {
    const row = makeResultItem(item.name, describeMeasurement(item, findFamily(families, item)), () => pickFromSearch(() => loadHeadphone(item, hint)));
    row.classList.add("measurement");
    if (item.isAutoEqPick) row.firstChild.append(makeElement("em", { className: "pick", text: "AutoEQ's pick", title: "AutoEQ recommends this measurement of the headphone" }));
    return row;
  }));
  if (list.children.length === 0) hint.textContent = "No sound by that name.";
}

function renderEarList() {
  const list = partOf("ear", "results");
  const items = Object.keys(presets.ear).map((name) => makePresetItem("ear", name, (place) => place()));
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
 * @param {string} name
 * @param {string} source
 */
function applyText(role, name, source) {
  const parsed = parseAutoEq(partOf(role, "text").value);
  if (parsed.bands.length === 0) {
    showHint(role, "No AutoEQ filters found in that text.");
    return;
  }
  replaceLayer({ name, source, bands: parsed.bands, preampDb: parsed.preampDb }, role);
  showHint(role, `Applied ${describeBandCount(parsed.bands)} to ${layerLabels[role]}. Press Save to keep it.`);
}

/** @param {LayerRole} role */
function renderConfirmSaveLabel(role) {
  const name = partOf(role, "save-name").value.trim();
  partOf(role, "confirm-save").textContent = presets[role][name] ? "Replace" : "Save";
}

// Each section button opens its own row. A second press closes it.
/**
 * @param {LayerRole} role
 * @param {string} action
 */
function toggleLibraryAction(role, action) {
  const open = openActions[role] === action ? "" : action;
  openActions[role] = open;
  const isNaming = open === "save" || open === "saveAs";
  partOf(role, "save-row").hidden = !isNaming;
  partOf(role, "drawer").hidden = open !== "paste" && open !== "export";
  partOf(role, "apply").hidden = open !== "paste";
  for (const button of partOf(role, "library-actions").children) button.classList.toggle("on", button.dataset.action === open);
  showHint(role, "");

  const layer = config.layers[role];
  const text = partOf(role, "text");
  if (isNaming) {
    // Save fills in the current name, so an AutoEQ pick saves under its headphone name.
    partOf(role, "save-name").value = open === "save" ? layer.name : "";
    renderConfirmSaveLabel(role);
    partOf(role, "save-name").focus();
  }
  if (open === "export") {
    const bands = layer ? layer.bands : [];
    text.value = toAutoEq({ preampDb: autoPreampDb(bands), bands });
    showHint(role, `${layerLabels[role]} alone, as AutoEQ text. Copy it out.`);
  }
  if (open === "paste") {
    text.value = "";
    text.focus();
  }
}

const pastedNames = { headphone: "Pasted headphone", ear: "Pasted ear tuning" };

const libraryActions = {
  save: (role) => {
    if (isSavedPreset(role)) savePreset(role, config.layers[role].name);
    else toggleLibraryAction(role, "save");
  },
  saveAs: (role) => toggleLibraryAction(role, "saveAs"),
  confirmSave: (role) => {
    const name = partOf(role, "save-name").value.trim();
    if (name) savePreset(role, name);
    else showHint(role, "Give the preset a name first.");
  },
  import: (role) => partOf(role, "import-file").click(),
  paste: (role) => toggleLibraryAction(role, "paste"),
  export: (role) => toggleLibraryAction(role, "export"),
  apply: (role) => applyText(role, pastedNames[role], "Pasted"),
  // The test measures what you hear, so My ear comes off first. The headphone layer stays on.
  measure: () => {
    if (config.layers.ear) config.layers.ear.on = false;
    commit();
    chrome.tabs.create({ url: "https://eqbyear.com" });
    showHint("ear", "eqbyear is open in a new tab, with My ear off. Click the goui icon on that tab, run the test, then Paste the result here.");
  },
};

// A window with no side panel, such as an installed app, opens this page as the popup of one tab.
const popupTabId = Number(new URLSearchParams(location.search).get("tab"));
const isPopup = Number.isInteger(popupTabId) && popupTabId > 0;
let isPopupTabHeard = false;
const idleInstruction = isPopup ? "goui is off on this tab. Press the power button to EQ it." : "Click the goui icon in the toolbar while you are on the tab you want to EQ.";

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

function applyTelemetry(message) {
  byId("level").textContent = message.levelDb <= silenceDb ? "--" : message.levelDb.toFixed(1);
  // Each reading is raw. Blending with the last frame keeps the spectrum calm to look at.
  const newShare = 0.3;
  const previous = spectrumDb;
  spectrumDb = message.spectrumDb.map((db, index) => (previous.length ? ((1 - newShare) * previous[index]) + (newShare * db) : db));
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

const semitonesPerOctave = 12;
const gainStepDb = 0.5;

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

byId("sliders").addEventListener("input", (event) => {
  if (event.target.type !== "range") return;
  const value = Number(event.target.value);
  if (event.target.id === "preamp") {
    config.autoPreamp = false;
    config.preampDb = value;
  } else {
    config.sliders[`${event.target.id}Db`] = value;
  }
  commitEdit(null);
});

byId("levelMatch").addEventListener("change", (event) => {
  isLevelMatched = event.target.checked;
  chrome.storage.local.set({ isLevelMatched });
});

// Turning Auto off keeps the value Auto had, so the sound does not jump.
byId("autoPreamp").addEventListener("click", () => {
  if (config.autoPreamp) config.preampDb = makePlayedSound(config).preampDb;
  config.autoPreamp = !config.autoPreamp;
  commitEdit(null);
});

byId("zoom").addEventListener("click", (event) => {
  const button = event.target.closest("[data-zoom]");
  if (button) for (const graph of graphs) graph.setZoom(button.dataset.zoom);
  renderPills();
});

byId("tall").addEventListener("click", () => {
  const isTall = !tuneGraph.isTall;
  for (const graph of graphs) graph.setTall(isTall);
  chrome.storage.local.set({ view: tuneGraph.isTall ? "tall" : "wide" });
  renderPills();
});

byId("chips").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-index], [data-add]");
  if (!chip) return;
  if (chip.dataset.add) {
    addBandToLayer(chip.dataset.add, 1000, 0);
    return;
  }
  // A second press on the chip you already chose clears the choice.
  const index = Number(chip.dataset.index);
  graphHooks.selectBand(index === selectedIndex ? -1 : index);
});

byId("table").addEventListener("click", (event) => {
  const row = event.target.closest("[data-index]");
  if (row) graphHooks.selectBand(Number(row.dataset.index));
});

byId("inspector").addEventListener("click", (event) => {
  const button = event.target.closest("[data-step]");
  if (!button) return;
  bandSteps[button.dataset.step](bandAt(selectedIndex), Number(button.dataset.direction));
  commitEdit();
});

byId("inspector").addEventListener("input", (event) => {
  const edit = bandFieldSetters[event.target.id];
  if (!edit) return;
  edit(bandAt(selectedIndex), Number(event.target.value.replace(",", ".")));
  commitEdit();
});

byId("bandSegments").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.id === "moreTypes") {
    isMoreOpen = !isMoreOpen;
    renderInspector();
    return;
  }
  bandAt(selectedIndex).type = button.dataset.type;
  commitEdit();
});

byId("bandType").addEventListener("change", (event) => {
  bandAt(selectedIndex).type = event.target.value;
  commitEdit();
});

byId("bandOn").addEventListener("click", () => {
  const band = bandAt(selectedIndex);
  band.on = !band.on;
  commitEdit();
});

byId("bandSolo").addEventListener("click", () => {
  soloIndex = soloIndex === selectedIndex ? -1 : selectedIndex;
  commit();
});

byId("bandDelete").addEventListener("click", () => {
  const role = roleAt(selectedIndex);
  const layer = config.layers[role];
  layer.bands.splice(layer.bands.indexOf(bandAt(selectedIndex)), 1);
  unselectBand();
  commitEdit(role);
});

for (const role of layerOrder) {
  sectionOf(role).addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (button) libraryActions[button.dataset.action](role);
  });
  partOf(role, "save-name").addEventListener("input", () => renderConfirmSaveLabel(role));
  partOf(role, "save-name").addEventListener("keydown", (event) => {
    if (event.key === "Enter") libraryActions.confirmSave(role);
  });
  partOf(role, "import-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    partOf(role, "text").value = await file.text();
    event.target.value = "";
    const dot = file.name.lastIndexOf(".");
    applyText(role, dot > 0 ? file.name.slice(0, dot) : file.name, "From a file");
  });
}

const typingPauseMs = 150;
partOf("headphone", "search").addEventListener("input", debounce(renderHeadphoneList, typingPauseMs));

byId("exportAll").addEventListener("click", () => {
  const whole = byId("wholeText");
  whole.hidden = false;
  whole.value = toAutoEq({ preampDb: makePlayedSound(config).preampDb, bands: listExportBands(config) });
});

// The service worker starts a new tab with the stored config, which has no A/B or Solo and can be
// up to storageWaitMs old. An open panel then sends the sound it shows.
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === messageTypes.captureState) {
    applyCaptureState(message.state);
    if (message.state.isCapturing) sendAudio();
  }
  if (message && message.type === messageTypes.audioTelemetry) applyTelemetry(message);
  return false;
});

async function readPresets(stored) {
  for (const role of layerOrder) {
    const list = stored[`${role}Presets`] || {};
    for (const [name, preset] of Object.entries(list)) presets[role][name] = { bands: cleanBands(preset && preset.bands) };
  }
  const olderSounds = stored.savedSounds || stored.presets;
  if (!olderSounds) return;

  // A sound saved before the two lists holds both layers. It becomes a headphone preset. When it
  // has ear bands, it also becomes an ear preset under the same name. A preset of that name wins.
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

async function startPanel() {
  for (const type of bandTypes) byId("bandType").append(new Option(typeLabels[type], type));
  setSliderRanges();

  loadedTargets = await loadTargets();
  const stored = await chrome.storage.local.get(["config", "headphonePresets", "earPresets", "savedSounds", "presets", "view", "tab", "hasCaptured", "isLevelMatched", "keepsPreampInCompare"]);
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

  // Opening the popup counts as the click on the icon, so goui starts on its tab right away.
  if (!isPopup) return;
  document.documentElement.classList.add("popup");
  byId("power").hidden = false;
  const start = { type: messageTypes.captureStart, tabId: popupTabId };
  byId("power").addEventListener("click", () => trySendMessage(isPopupTabHeard ? { type: messageTypes.captureStop } : start));
  trySendMessage(start);
}

startPanel();

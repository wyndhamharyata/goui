import {
  audioNodeType,
  autoPreampDb,
  bandTypes,
  clamp,
  cleanBands,
  defaultConfig,
  engineConfig,
  flatBands,
  flatSliders,
  frequencyRangeHz,
  gainRangeDb,
  hasGain,
  layerLabels,
  layerOrder,
  listOnLayers,
  listPlayedBands,
  makeLayer,
  maxBoostDb,
  newBand,
  parseAutoEq,
  qRange,
  qStepRatio,
  roundGainDb,
  sanitizeConfig,
  toAutoEq,
  typeLabels,
} from "./shared/filters.js";
import { messageTypes, trySendMessage } from "./shared/messages.js";
import { formatDb, formatHz, layerColor, makeGraph, qToOctaves, typeColor } from "./graph.js";

const byId = (id) => document.getElementById(id);
const sectionOf = (role) => document.querySelector(`.preset-section[data-role="${role}"]`);
const partOf = (role, name) => sectionOf(role).querySelector(`.${name}`);
const autoEqBase = "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/";
// The source a layer shows once it matches one of your presets.
const savedSource = "Saved";

function makeElement(tag, { className = "", text = "", title = "" } = {}) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== "") element.textContent = text;
  if (title) element.title = title;
  return element;
}

function debounce(run, waitMs) {
  let timer = 0;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(run, waitMs);
  };
}

function showHint(role, text) {
  partOf(role, "action-hint").textContent = text;
}

const starterSounds = [
  { name: "Flat", bands: [] },
  {
    name: "Warm",
    bands: [
      { on: true, type: "LSC", frequencyHz: 120, gainDb: 3, q: 0.71 },
      { on: true, type: "HSC", frequencyHz: 8000, gainDb: -2, q: 0.71 },
    ],
  },
  { name: "Clear vocals", bands: [{ on: true, type: "PK", frequencyHz: 2500, gainDb: 3, q: 1 }] },
  {
    name: "Night listening",
    bands: [
      { on: true, type: "LSC", frequencyHz: 100, gainDb: -3, q: 0.71 },
      { on: true, type: "HSC", frequencyHz: 6000, gainDb: -3, q: 0.71 },
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
let isBypassed = false;
let autoEqItems = null;
let isMoreOpen = false;
const openActions = { headphone: "", ear: "" };

// Every band in the panel, in layer order, with the layer it belongs to. A layer that is off keeps
// its bands, so they can still be edited while it is silent.
function listBandEntries() {
  return layerOrder.flatMap((role) => {
    const layer = config.layers[role];
    return layer ? layer.bands.map((band) => ({ role, band })) : [];
  });
}

function bandAt(index) {
  const entry = listBandEntries()[index];
  return entry && entry.band;
}

function roleAt(index) {
  const entry = listBandEntries()[index];
  return entry && entry.role;
}

// Holding A/B and the main switch both silence the EQ. The graph then draws a flat line.
function isEqOff() {
  return isBypassed || !config.enabled;
}

// What the panel draws is what the engine plays, with the A/B button and Solo applied.
function listCurveBands() {
  if (isEqOff()) return [];
  const soloed = bandAt(soloIndex);
  if (soloed) return [{ ...soloed, on: true }];
  return listPlayedBands(config);
}

// Each layer's own curve, for the dashed lines under the total.
function listCurveLayers() {
  if (isEqOff() || soloIndex >= 0) return [];
  return listOnLayers(config);
}

// Solo follows the chosen band, so both go together.
function unselectBand() {
  selectedIndex = -1;
  soloIndex = -1;
}

function removeEarLayer() {
  delete config.layers.ear;
  unselectBand();
  commit();
}

function addBandToLayer(role, frequencyHz, gainDb) {
  config.layers[role] ??= makeLayer("My ear tuning", "Your bands");
  const band = { ...newBand(frequencyHz), gainDb };
  config.layers[role].bands.push(band);
  selectedIndex = listBandEntries().findIndex((entry) => entry.band === band);
  commitEdit(role);
}

const graphHooks = {
  bands: listBandEntries,
  listCurveBands,
  curveLayers: listCurveLayers,
  spectrum: () => spectrumDb,
  selectedIndex: () => selectedIndex,
  isBypassed: isEqOff,
  select: (index) => {
    selectedIndex = index;
    refresh();
  },
  changed: () => commitEdit(),
  // A new band joins the layer of the selected band. With none selected it joins the headphone layer.
  addBand: (frequencyHz, gainDb) => addBandToLayer(roleAt(selectedIndex) || "headphone", frequencyHz, gainDb),
};

// The Listen graph is a preview. It matches the Tune graph in size and follows its zoom and turn.
const listenGraph = makeGraph(byId("listenGraph"), { height: 210, tallHeight: 440, interactive: false, regions: true, layerCurves: true }, graphHooks);
const tuneGraph = makeGraph(byId("tuneGraph"), { height: 210, tallHeight: 440, interactive: true, layerCurves: true }, graphHooks);
const graphs = [listenGraph, tuneGraph];

function sendAudio() {
  let value = config;
  const soloed = bandAt(soloIndex);
  const isSoloing = !isBypassed && Boolean(soloed);
  if (isBypassed) value = { ...config, enabled: false };
  if (isSoloing) {
    const layers = {};
    for (const role of layerOrder) {
      const layer = config.layers[role];
      if (layer) layers[role] = { ...layer, on: true, bands: layer.bands.map((band) => ({ ...band, on: band === soloed })) };
    }
    value = { ...config, layers, sliders: flatSliders };
  }
  trySendMessage({ type: messageTypes.audioConfig, config: value });
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
function setField(id, value) {
  const field = byId(id);
  if (field !== document.activeElement) field.value = value;
}

function describeLayerName(layer) {
  return layer.isEdited ? `${layer.name}, edited` : layer.name;
}

function openLibrarySection(role) {
  showTab("library");
  sectionOf(role).scrollIntoView({ block: "start" });
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
      if (openActions.ear !== "paste") openLibraryAction("ear", "paste");
    });
    host.append(add);
  }
}

function renderSound() {
  const engine = engineConfig(config);
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
  const isCommon = ["PK", "LSC", "HSC", "HP", "LP"].includes(band.type);
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

function showTab(name) {
  byId("app").dataset.showing = name;
  for (const button of byId("tabs").children) button.classList.toggle("on", button.dataset.tab === name);
  chrome.storage.local.set({ tab: name });
}

function renderPills() {
  for (const button of byId("zoom").querySelectorAll("[data-zoom]")) {
    button.classList.toggle("on", button.dataset.zoom === tuneGraph.zoom);
  }
  byId("tall").classList.toggle("on", tuneGraph.vertical);
}

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
function placeBands(sound, role) {
  config.layers[role] = makeLayer(sound.name, sound.source, cleanBands(sound.bands));
  if (role === "headphone" && sound.preampDb !== undefined) config.preampDb = sound.preampDb;
  unselectBand();
  commit();
}

function storePresets(role) {
  chrome.storage.local.set({ [`${role}Presets`]: presets[role] });
  renderList[role]();
}

function savePreset(role, name) {
  const layer = config.layers[role];
  const isUpdate = Boolean(presets[role][name]);
  presets[role][name] = { bands: structuredClone(layer.bands) };
  layer.name = name;
  layer.source = savedSource;
  layer.isEdited = false;
  openLibraryAction(role, "");
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
  for (const line of text.split("\n")) {
    // A line reads "- [Name](./path) by source". The path can hold brackets of its own, such as
    // "(ANC Off)", so it runs to the last ") by ".
    const nameEnd = line.indexOf("](./");
    const pathEnd = line.lastIndexOf(") by ");
    const isEntry = line.startsWith("- [") && nameEnd > 0 && pathEnd > nameEnd;
    // One headphone can have several measurements, one per source, so the source tells them apart.
    if (isEntry) autoEqItems.push({ name: line.slice(3, nameEnd), path: line.slice(nameEnd + 4, pathEnd), source: line.slice(pathEnd + 5).trim() });
  }
  return autoEqItems;
}

async function loadHeadphone(item, hint) {
  hint.textContent = `Loading ${item.name}...`;
  const file = encodeURIComponent(`${item.name} ParametricEQ.txt`);
  const response = await fetch(`${autoEqBase}${item.path}/${file}`).catch(() => null);
  if (!response || !response.ok) {
    hint.textContent = `${item.name} did not load. Check the network and try again.`;
    return false;
  }
  const parsed = parseAutoEq(await response.text());
  placeBands({ name: item.name, source: "AutoEQ", bands: parsed.bands, preampDb: parsed.preampDb }, "headphone");
  hint.textContent = "";
  return true;
}

// A pick from a typed search is the end of that search. The box empties and Listen shows the sound.
async function pickFromSearch(load) {
  // Only a headphone download can fail. Its loader then returns false. The other loaders return nothing.
  const isLoaded = (await load()) !== false;
  const box = partOf("headphone", "search");
  const isTypedSearch = box.value.trim() !== "";
  if (!isLoaded || !isTypedSearch) return;
  box.value = "";
  searchLibrary();
  showTab("listen");
}

function countBands(bands) {
  return bands.length === 1 ? "1 band" : `${bands.length} bands`;
}

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
function makePresetItem(role, name, pick) {
  const place = () => placeBands({ name, source: savedSource, bands: presets[role][name].bands }, role);
  return makeResultItem(name, countBands(presets[role][name].bands), () => pick(place), () => deletePreset(role, name));
}

function appendSection(list, title, items) {
  if (items.length === 0) return;
  list.append(makeElement("h4", { text: title }), ...items);
}

async function findHeadphones(text, hint) {
  hint.textContent = "Searching AutoEQ...";
  const items = await loadAutoEqIndex().catch(() => null);
  hint.textContent = items ? "" : "The AutoEQ list did not load. Check the network.";
  return (items || []).filter((item) => item.name.toLowerCase().includes(text)).slice(0, 20);
}

// An empty box lists your headphone presets and the starter sounds. Typing also searches AutoEQ.
async function searchLibrary() {
  const list = partOf("headphone", "results");
  const hint = partOf("headphone", "search-hint");
  const text = partOf("headphone", "search").value.trim().toLowerCase();
  list.dataset.query = text;
  const matches = (name) => name.toLowerCase().includes(text);

  const saved = Object.keys(presets.headphone).filter(matches).map((name) => makePresetItem("headphone", name, pickFromSearch));
  if (saved.length === 0 && text === "") {
    saved.push(makeElement("p", { className: "hint", text: "Nothing saved yet. Pick your headphone, then press Save." }));
  }
  const starterItems = starterSounds.filter((sound) => matches(sound.name)).map((sound) => makeResultItem(sound.name, countBands(sound.bands),
    () => pickFromSearch(() => placeBands({ name: sound.name, source: "Starter sound", bands: sound.bands }, "headphone"))));

  // Your presets and the starter sounds show at once. The AutoEQ list joins once it loads.
  const show = (headphoneItems) => {
    list.replaceChildren();
    appendSection(list, "Your headphone presets", saved);
    appendSection(list, "AutoEQ headphones", headphoneItems);
    appendSection(list, "Starter sounds", starterItems);
    renderPresetCards();
  };
  show([]);
  hint.textContent = "";
  if (text.length < 2) return;

  const headphones = await findHeadphones(text, hint);
  if (list.dataset.query !== text) return;
  show(headphones.map((item) => makeResultItem(item.name, `AutoEQ, ${item.source}`, () => pickFromSearch(() => loadHeadphone(item, hint)))));
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

const renderList = { headphone: searchLibrary, ear: renderEarList };

function applyText(role, name, source) {
  const parsed = parseAutoEq(partOf(role, "text").value);
  if (parsed.bands.length === 0) {
    showHint(role, "No AutoEQ filters found in that text.");
    return;
  }
  placeBands({ name, source, bands: parsed.bands, preampDb: parsed.preampDb }, role);
  showHint(role, `Applied ${countBands(parsed.bands)} to ${layerLabels[role]}. Press Save to keep it.`);
}

function renderSaveButton(role) {
  const name = partOf(role, "save-name").value.trim();
  partOf(role, "confirm-save").textContent = presets[role][name] ? "Replace" : "Save";
}

// Each section button opens its own row. A second press closes it.
function openLibraryAction(role, action) {
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
    renderSaveButton(role);
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
    else openLibraryAction(role, "save");
  },
  saveAs: (role) => openLibraryAction(role, "saveAs"),
  confirmSave: (role) => {
    const name = partOf(role, "save-name").value.trim();
    if (name) savePreset(role, name);
    else showHint(role, "Give the preset a name first.");
  },
  import: (role) => partOf(role, "import-file").click(),
  paste: (role) => openLibraryAction(role, "paste"),
  export: (role) => openLibraryAction(role, "export"),
  apply: (role) => applyText(role, pastedNames[role], "Pasted"),
  // The test measures what you hear, so My ear comes off first. The headphone layer stays on.
  measure: () => {
    if (config.layers.ear) config.layers.ear.on = false;
    commit();
    chrome.tabs.create({ url: "https://eqbyear.com" });
    showHint("ear", "eqbyear is open in a new tab, with My ear off. Click the goui icon on that tab, run the test, then Paste the result here.");
  },
};

const idleInstruction = "Click the goui icon in the toolbar while you are on the tab you want to EQ.";

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
  status.title = isCapturing ? "Click the goui icon on this tab to turn goui off, or on another tab to move it there." : "";
}

function showTelemetry(message) {
  byId("level").textContent = message.levelDb <= -120 ? "--" : message.levelDb.toFixed(1);
  // Each reading is raw. Blending with the last frame keeps the spectrum calm to look at.
  const newShare = 0.3;
  const previous = spectrumDb;
  spectrumDb = message.spectrumDb.map((db, index) => (previous.length ? ((1 - newShare) * previous[index]) + (newShare * db) : db));
  for (const graph of graphs) graph.renderSpectrum();
}

function setBypass(isOn) {
  if (isBypassed === isOn) return;
  isBypassed = isOn;
  byId("compare").classList.toggle("on", isOn);
  sendAudio();
  refresh();
}

const steps = {
  frequency: (band, direction) => {
    band.frequencyHz = Math.round(clamp(band.frequencyHz * (2 ** (direction / 12)), ...frequencyRangeHz));
  },
  gain: (band, direction) => {
    if (hasGain(band.type)) band.gainDb = clamp(roundGainDb(band.gainDb + (direction * 0.5)), ...gainRangeDb);
  },
  q: (band, direction) => {
    band.q = clamp(band.q * (qStepRatio ** direction), ...qRange);
  },
};

const fieldEdits = {
  frequencyInput: (band, value) => {
    band.frequencyHz = clamp(value || 1000, ...frequencyRangeHz);
  },
  gainInput: (band, value) => {
    band.gainDb = clamp(value || 0, ...gainRangeDb);
  },
  qInput: (band, value) => {
    band.q = clamp(value || 1, ...qRange);
  },
};

byId("tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (button) showTab(button.dataset.tab);
});

for (const id of ["help", "guide"]) {
  byId(id).addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("src/intro.html") }));
}

byId("compare").addEventListener("pointerdown", () => setBypass(true));
byId("compare").addEventListener("pointerup", () => setBypass(false));
byId("compare").addEventListener("pointerleave", () => setBypass(false));

byId("enabled").addEventListener("change", (event) => {
  config.enabled = event.target.checked;
  commit();
});

byId("sliders").addEventListener("input", (event) => {
  const value = Number(event.target.value);
  if (event.target.id === "preamp") {
    config.autoPreamp = false;
    config.preampDb = value;
  } else {
    config.sliders[`${event.target.id}Db`] = value;
  }
  commitEdit(null);
});

// Turning Auto off keeps the value Auto had, so the sound does not jump.
byId("autoPreamp").addEventListener("click", () => {
  if (config.autoPreamp) config.preampDb = engineConfig(config).preampDb;
  config.autoPreamp = !config.autoPreamp;
  commitEdit(null);
});

byId("zoom").addEventListener("click", (event) => {
  const button = event.target.closest("[data-zoom]");
  if (button) for (const graph of graphs) graph.setZoom(button.dataset.zoom);
  renderPills();
});

byId("tall").addEventListener("click", () => {
  const isVertical = !tuneGraph.vertical;
  for (const graph of graphs) graph.setVertical(isVertical);
  chrome.storage.local.set({ view: tuneGraph.vertical ? "vertical" : "horizontal" });
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
  graphHooks.select(index === selectedIndex ? -1 : index);
});

byId("table").addEventListener("click", (event) => {
  const row = event.target.closest("[data-index]");
  if (row) graphHooks.select(Number(row.dataset.index));
});

byId("inspector").addEventListener("click", (event) => {
  const button = event.target.closest("[data-step]");
  if (!button) return;
  steps[button.dataset.step](bandAt(selectedIndex), Number(button.dataset.direction));
  commitEdit();
});

byId("inspector").addEventListener("input", (event) => {
  const edit = fieldEdits[event.target.id];
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
  partOf(role, "save-name").addEventListener("input", () => renderSaveButton(role));
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
partOf("headphone", "search").addEventListener("input", debounce(searchLibrary, typingPauseMs));

byId("exportAll").addEventListener("click", () => {
  const whole = byId("wholeText");
  whole.hidden = false;
  whole.value = toAutoEq({ preampDb: engineConfig(config).preampDb, bands: flatBands(config) });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === messageTypes.captureState) applyCaptureState(message.state);
  if (message && message.type === messageTypes.audioTelemetry) showTelemetry(message);
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

async function hydrate() {
  for (const type of bandTypes) byId("bandType").append(new Option(typeLabels[type], type));

  const stored = await chrome.storage.local.get(["config", "headphonePresets", "earPresets", "savedSounds", "presets", "view", "tab", "hasCaptured"]);
  byId("app").dataset.started = stored.hasCaptured ? "yes" : "no";
  if (stored.config) config = sanitizeConfig(stored.config);
  await readPresets(stored);
  for (const graph of graphs) graph.setVertical(stored.view === "vertical");
  showTab(stored.tab || "listen");
  renderPills();
  sendAudio();
  refresh();
  searchLibrary();
  renderEarList();

  const session = await chrome.storage.session.get("capture");
  applyCaptureState(session.capture || { isCapturing: false });
}

hydrate();

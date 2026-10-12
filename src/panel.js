import {
  audioNodeType,
  bandTypes,
  clamp,
  defaultConfig,
  engineConfig,
  hasGain,
  sliderBands,
  maxBoostDb,
  newBand,
  parseAutoEq,
  qRange,
  qStepRatio,
  sanitizeConfig,
  toAutoEq,
  typeLabels,
} from "./shared/filters.js";
import { formatHz, makeGraph, qToOctaves, formatDb, typeColor } from "./graph.js";

const byId = (id) => document.getElementById(id);
const autoEqBase = "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/";

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
let savedSounds = {};
let spectrumDb = [];
let isCapturing = false;
let selectedIndex = -1;
let soloIndex = -1;
let isBypassed = false;
let saveTimer = 0;
let autoEqItems = null;
let isMoreOpen = false;
let openAction = "";

// What the panel draws is what the engine plays, with the A/B button and Solo applied.
function listCurveBands() {
  if (isBypassed || !config.enabled) return [];
  if (config.bands[soloIndex]) return [{ ...config.bands[soloIndex], on: true }];
  return [...config.bands, ...sliderBands(config.sliders)];
}

const graphHooks = {
  bands: () => config.bands,
  listCurveBands,
  spectrum: () => spectrumDb,
  selectedIndex: () => selectedIndex,
  isBypassed: () => isBypassed || !config.enabled,
  select: (index) => {
    selectedIndex = index;
    refresh();
  },
  changed: () => commitEdit(),
  addBand: (frequencyHz, gainDb) => {
    config.bands.push({ ...newBand(frequencyHz), gainDb });
    selectedIndex = config.bands.length - 1;
    commitEdit();
  },
};

// The Listen graph is a preview. It matches the Tune graph in size and follows its zoom and turn.
const listenGraph = makeGraph(byId("listenGraph"), { height: 210, tallHeight: 440, interactive: false, regions: true }, graphHooks);
const tuneGraph = makeGraph(byId("tuneGraph"), { height: 210, tallHeight: 440, interactive: true }, graphHooks);

function sendAudio() {
  let value = config;
  const isSoloing = !isBypassed && Boolean(config.bands[soloIndex]);
  if (isBypassed) value = { ...config, enabled: false };
  if (isSoloing) {
    const bands = config.bands.map((band, index) => ({ ...band, on: index === soloIndex }));
    value = { ...config, bands, sliders: { bassDb: 0, vocalsDb: 0, trebleDb: 0 } };
  }
  chrome.runtime.sendMessage({ type: "audio:config", config: value }).catch(() => {});
}

// The sound follows every edit at once. Only the storage write waits for the edits to pause.
function commit() {
  sendAudio();
  const storageWaitMs = 120;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ config }), storageWaitMs);
  refresh();
}

// A change to the sound itself. The card then says the sound differs from the one you picked.
function commitEdit() {
  config.isEdited = true;
  commit();
}

function refresh() {
  listenGraph.render();
  tuneGraph.render();
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

function renderSound() {
  const engine = engineConfig(config);
  byId("soundName").textContent = config.soundName;
  byId("soundKind").textContent = config.isEdited ? `${config.soundKind}, edited` : config.soundKind;
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

function renderChips() {
  const chips = byId("chips");
  const scrollLeft = chips.scrollLeft;
  chips.replaceChildren();
  config.bands.forEach((band, index) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.classList.toggle("on", index === selectedIndex);
    chip.classList.toggle("muted", !band.on);
    chip.dataset.index = index;
    const number = document.createElement("i");
    number.style.background = typeColor[band.type];
    number.textContent = index + 1;
    chip.append(number, formatHz(band.frequencyHz));
    chips.append(chip);
  });
  const add = document.createElement("button");
  add.className = "chip add";
  add.dataset.index = "add";
  add.textContent = "Add band";
  chips.append(add);
  chips.scrollLeft = scrollLeft;
}

function describeQ(band) {
  if (band.type === "PK") return `Q, ${qToOctaves(band.q).toFixed(1)} octaves wide`;
  if (audioNodeType[band.type].endsWith("shelf")) return "Q, not used by a shelf yet";
  return "Q";
}

function renderInspector() {
  const band = config.bands[selectedIndex];
  byId("inspectorEmpty").hidden = Boolean(band);
  byId("inspectorBody").hidden = !band;
  if (!band) return;

  const title = byId("bandTitle");
  title.textContent = `${selectedIndex + 1}. ${typeLabels[band.type]}`;
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
  const head = document.createElement("tr");
  for (const label of ["Band", "Hz", "dB", "Q"]) {
    const cell = document.createElement("th");
    cell.textContent = label;
    head.append(cell);
  }
  const rows = config.bands.map((band, index) => {
    const row = document.createElement("tr");
    row.dataset.index = index;
    row.classList.toggle("on", index === selectedIndex);
    const number = document.createElement("span");
    number.className = "number";
    number.style.color = typeColor[band.type];
    number.textContent = index + 1;
    const name = document.createElement("td");
    name.append(number, typeLabels[band.type]);
    row.append(name);

    const gain = hasGain(band.type) ? formatDb(band.gainDb) : "";
    for (const value of [Math.round(band.frequencyHz), gain, band.q.toFixed(2)]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
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

function markCurrent() {
  for (const item of document.querySelectorAll(".results .item")) {
    item.classList.toggle("on", item.firstChild.textContent === config.soundName);
  }
}

function applySound(name, kind, bands, preampDb) {
  config.soundName = name;
  config.soundKind = kind;
  config.isEdited = false;
  config.bands = sanitizeConfig({ bands }).bands;
  if (preampDb !== undefined) config.preampDb = preampDb;
  selectedIndex = -1;
  soloIndex = -1;
  commit();
  markCurrent();
}

// A saved sound keeps everything, the sliders and the preamp too. Only the EQ switch stays as it is.
function loadSavedSound(name) {
  config = { ...sanitizeConfig(savedSounds[name]), enabled: config.enabled, soundName: name, soundKind: "Saved", isEdited: false };
  selectedIndex = -1;
  soloIndex = -1;
  commit();
  markCurrent();
}

function deleteSavedSound(name) {
  delete savedSounds[name];
  chrome.storage.local.set({ savedSounds });
  searchLibrary();
}

function saveSound() {
  const name = byId("saveName").value.trim();
  if (!name) {
    byId("libraryHint").textContent = "Give the sound a name first.";
    return;
  }
  const isUpdate = Boolean(savedSounds[name]);
  config.soundName = name;
  config.soundKind = "Saved";
  config.isEdited = false;
  savedSounds[name] = structuredClone(config);
  chrome.storage.local.set({ savedSounds });
  commit();
  searchLibrary();
  openLibraryAction("");
  byId("libraryHint").textContent = `${isUpdate ? "Updated" : "Saved"} ${name}.`;
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
    if (isEntry) autoEqItems.push({ name: line.slice(3, nameEnd), path: line.slice(nameEnd + 4, pathEnd) });
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
  applySound(item.name, "AutoEQ headphones", parsed.bands, parsed.preampDb);
  hint.textContent = "";
  return true;
}

// A pick from a typed search is the end of that search. The box empties and Listen shows the sound.
async function pickFromSearch(load) {
  // Only a headphone download can fail. Its loader then returns false. The other loaders return nothing.
  const isLoaded = (await load()) !== false;
  const box = byId("librarySearch");
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
  const button = document.createElement("button");
  button.className = "item";
  button.classList.toggle("on", label === config.soundName);
  const name = document.createElement("span");
  name.textContent = label;
  const small = document.createElement("small");
  small.textContent = detail;
  button.append(name, small);
  button.addEventListener("click", onPick);
  if (!onRemove) return button;

  const remove = document.createElement("button");
  remove.className = "remove";
  remove.textContent = "×";
  remove.title = `Delete ${label}`;
  remove.addEventListener("click", onRemove);
  const row = document.createElement("div");
  row.className = "result-row";
  row.append(button, remove);
  return row;
}

function appendSection(list, title, items) {
  if (items.length === 0) return;
  const heading = document.createElement("h4");
  heading.textContent = title;
  list.append(heading, ...items);
}

async function findHeadphones(text, hint) {
  hint.textContent = "Searching...";
  const items = await loadAutoEqIndex().catch(() => null);
  hint.textContent = items ? "" : "The AutoEQ list did not load. Check the network.";
  return (items || []).filter((item) => item.name.toLowerCase().includes(text)).slice(0, 20);
}

// An empty box lists your saved sounds and the starter sounds. Typing also searches the headphones.
async function searchLibrary() {
  const list = byId("libraryResults");
  const hint = byId("librarySearchHint");
  const text = byId("librarySearch").value.trim().toLowerCase();
  list.dataset.query = text;
  hint.textContent = "";
  const headphones = text.length >= 2 ? await findHeadphones(text, hint) : [];
  if (list.dataset.query !== text) return;

  const matches = (name) => name.toLowerCase().includes(text);
  const saved = Object.keys(savedSounds).filter(matches).map((name) =>
    makeResultItem(name, countBands(savedSounds[name].bands), () => pickFromSearch(() => loadSavedSound(name)), () => deleteSavedSound(name)));
  const headphoneItems = headphones.map((item) =>
    makeResultItem(item.name, "AutoEQ", () => pickFromSearch(() => loadHeadphone(item, hint))));
  const starterItems = starterSounds.filter((sound) => matches(sound.name)).map((sound) =>
    makeResultItem(sound.name, countBands(sound.bands), () => pickFromSearch(() => applySound(sound.name, "Starter sound", sound.bands))));

  list.replaceChildren();
  appendSection(list, "Saved", saved);
  appendSection(list, "AutoEQ headphones", headphoneItems);
  appendSection(list, "Starter sounds", starterItems);
  if (list.children.length === 0) hint.textContent = "No sound by that name.";
}

function applyText(name, kind) {
  const text = byId("libraryText").value.trim();
  const hint = byId("libraryHint");
  if (text.startsWith("{")) {
    try {
      config = { ...sanitizeConfig(JSON.parse(text)), enabled: config.enabled };
    } catch {
      hint.textContent = "That text is not valid JSON.";
      return;
    }
    commit();
    markCurrent();
    hint.textContent = `Applied ${config.soundName}.`;
    return;
  }
  const parsed = parseAutoEq(text);
  if (parsed.bands.length === 0) {
    hint.textContent = "No AutoEQ filters found in that text.";
    return;
  }
  applySound(name, kind, parsed.bands, parsed.preampDb);
  hint.textContent = `Applied ${parsed.bands.length} bands.`;
}

// Writes the sound you hear. A band at 0 dB changes nothing, so the unused sliders are left out.
function exportAutoEq() {
  const engine = engineConfig(config);
  const bands = engine.bands.filter((band) => !hasGain(band.type) || band.gainDb !== 0);
  byId("libraryText").value = toAutoEq({ preampDb: engine.preampDb, bands });
  byId("libraryHint").textContent = "The sound you hear, as AutoEQ text. Copy it out.";
}

// The name of a saved sound is filled in, so Save writes the edit back to it.
function renderSaveButton() {
  const name = byId("saveName").value.trim();
  byId("saveButton").textContent = savedSounds[name] ? "Update" : "Save";
}

// Each Library button opens its own row under the list. A second press closes it.
function openLibraryAction(action) {
  openAction = openAction === action ? "" : action;
  byId("saveRow").hidden = openAction !== "save";
  byId("textDrawer").hidden = openAction !== "paste" && openAction !== "export";
  byId("pasteActions").hidden = openAction !== "paste";
  byId("exportActions").hidden = openAction !== "export";
  for (const button of byId("libraryActions").children) button.classList.toggle("on", button.dataset.action === openAction);
  byId("libraryHint").textContent = "";

  if (openAction === "save") {
    byId("saveName").value = config.soundName;
    renderSaveButton();
    byId("saveName").focus();
  }
  if (openAction === "export") exportAutoEq();
  if (openAction === "paste") {
    byId("libraryText").value = "";
    byId("libraryText").focus();
  }
}

function applyCaptureState(state) {
  if (!state) return;
  isCapturing = Boolean(state.isCapturing);
  byId("capture").textContent = isCapturing ? "Stop" : "Start";
  const status = byId("status");
  status.textContent = state.error || (isCapturing ? state.title || "Capturing" : "No audio");
  status.title = status.textContent;
}

function showTelemetry(message) {
  byId("level").textContent = message.levelDb <= -120 ? "--" : message.levelDb.toFixed(1);
  // Each reading is raw. Blending with the last frame keeps the spectrum calm to look at.
  const newShare = 0.3;
  const previous = spectrumDb;
  spectrumDb = message.spectrumDb.map((db, index) => (previous.length ? ((1 - newShare) * previous[index]) + (newShare * db) : db));
  listenGraph.render();
  tuneGraph.render();
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
    band.frequencyHz = Math.round(clamp(band.frequencyHz * (2 ** (direction / 12)), 20, 20_000));
  },
  gain: (band, direction) => {
    if (hasGain(band.type)) band.gainDb = clamp(Math.round((band.gainDb + (direction * 0.5)) * 10) / 10, -20, 20);
  },
  q: (band, direction) => {
    band.q = clamp(band.q * (qStepRatio ** direction), ...qRange);
  },
};

const fieldEdits = {
  frequencyInput: (band, value) => {
    band.frequencyHz = clamp(value || 1000, 20, 20_000);
  },
  gainInput: (band, value) => {
    band.gainDb = clamp(value || 0, -20, 20);
  },
  qInput: (band, value) => {
    band.q = clamp(value || 1, ...qRange);
  },
};

byId("soundCard").addEventListener("click", () => {
  showTab("library");
  byId("librarySearch").focus();
});

byId("tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (button) showTab(button.dataset.tab);
});

byId("compare").addEventListener("pointerdown", () => setBypass(true));
byId("compare").addEventListener("pointerup", () => setBypass(false));
byId("compare").addEventListener("pointerleave", () => setBypass(false));

byId("enabled").addEventListener("change", (event) => {
  config.enabled = event.target.checked;
  commit();
});

byId("capture").addEventListener("click", async () => {
  applyCaptureState(await chrome.runtime.sendMessage({ type: isCapturing ? "capture:stop" : "capture:start" }));
});

byId("sliders").addEventListener("input", (event) => {
  const value = Number(event.target.value);
  if (event.target.id === "preamp") {
    config.autoPreamp = false;
    config.preampDb = value;
  } else {
    config.sliders[`${event.target.id}Db`] = value;
  }
  commitEdit();
});

// Turning Auto off keeps the value Auto had, so the sound does not jump.
byId("autoPreamp").addEventListener("click", () => {
  if (config.autoPreamp) config.preampDb = engineConfig(config).preampDb;
  config.autoPreamp = !config.autoPreamp;
  commitEdit();
});

byId("zoom").addEventListener("click", (event) => {
  const button = event.target.closest("[data-zoom]");
  if (button) {
    tuneGraph.setZoom(button.dataset.zoom);
    listenGraph.setZoom(button.dataset.zoom);
  }
  renderPills();
});

byId("tall").addEventListener("click", () => {
  tuneGraph.setVertical(!tuneGraph.vertical);
  listenGraph.setVertical(tuneGraph.vertical);
  chrome.storage.local.set({ view: tuneGraph.vertical ? "vertical" : "horizontal" });
  renderPills();
});

byId("chips").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-index]");
  if (!chip) return;
  if (chip.dataset.index === "add") {
    config.bands.push(newBand(1000));
    selectedIndex = config.bands.length - 1;
    commitEdit();
    return;
  }
  graphHooks.select(Number(chip.dataset.index));
});

byId("chips").addEventListener("wheel", (event) => {
  const isUpDown = Math.abs(event.deltaY) > Math.abs(event.deltaX);
  if (!isUpDown) return;
  event.preventDefault();
  byId("chips").scrollLeft += event.deltaY;
}, { passive: false });

byId("table").addEventListener("click", (event) => {
  const row = event.target.closest("[data-index]");
  if (row) graphHooks.select(Number(row.dataset.index));
});

byId("inspector").addEventListener("click", (event) => {
  const button = event.target.closest("[data-step]");
  if (!button) return;
  steps[button.dataset.step](config.bands[selectedIndex], Number(button.dataset.direction));
  commitEdit();
});

byId("inspector").addEventListener("input", (event) => {
  const edit = fieldEdits[event.target.id];
  if (!edit) return;
  edit(config.bands[selectedIndex], Number(event.target.value.replace(",", ".")));
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
  config.bands[selectedIndex].type = button.dataset.type;
  commitEdit();
});

byId("bandType").addEventListener("change", (event) => {
  config.bands[selectedIndex].type = event.target.value;
  commitEdit();
});

byId("bandOn").addEventListener("click", () => {
  config.bands[selectedIndex].on = !config.bands[selectedIndex].on;
  commitEdit();
});

byId("bandSolo").addEventListener("click", () => {
  soloIndex = soloIndex === selectedIndex ? -1 : selectedIndex;
  commit();
});

byId("bandDelete").addEventListener("click", () => {
  config.bands.splice(selectedIndex, 1);
  selectedIndex = -1;
  soloIndex = -1;
  commitEdit();
});

let searchTimer = 0;
byId("librarySearch").addEventListener("input", () => {
  const typingPauseMs = 150;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchLibrary, typingPauseMs);
});

byId("libraryActions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "import") byId("importFile").click();
  else openLibraryAction(button.dataset.action);
});

byId("saveButton").addEventListener("click", saveSound);
byId("saveName").addEventListener("input", renderSaveButton);
byId("applyText").addEventListener("click", () => applyText("Pasted AutoEQ", "Pasted"));
byId("exportAutoEq").addEventListener("click", exportAutoEq);
byId("exportJson").addEventListener("click", () => {
  byId("libraryText").value = JSON.stringify(config, null, 2);
  byId("libraryHint").textContent = "The sound you hear, as JSON. Copy it out.";
});

byId("importFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  byId("libraryText").value = await file.text();
  const dot = file.name.lastIndexOf(".");
  applyText(dot > 0 ? file.name.slice(0, dot) : file.name, "From a file");
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "capture:state") applyCaptureState(message.state);
  if (message && message.type === "audio:telemetry") showTelemetry(message);
  return false;
});

async function hydrate() {
  for (const type of bandTypes) byId("bandType").append(new Option(typeLabels[type], type));

  const stored = await chrome.storage.local.get(["config", "savedSounds", "presets", "view", "tab"]);
  if (stored.config) config = sanitizeConfig(stored.config);
  // Saved sounds stored before the rename are under presets.
  savedSounds = stored.savedSounds || stored.presets || {};
  tuneGraph.setVertical(stored.view === "vertical");
  listenGraph.setVertical(tuneGraph.vertical);
  showTab(stored.tab || "listen");
  renderPills();
  sendAudio();
  refresh();
  searchLibrary();

  const session = await chrome.storage.session.get("capture");
  applyCaptureState(session.capture);
}

hydrate();

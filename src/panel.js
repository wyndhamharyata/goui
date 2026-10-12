import {
  bandTypes,
  typeLabels,
  audioNodeType,
  hasGain,
  clamp,
  defaultConfig,
  newBand,
  parseAutoEq,
  toAutoEq,
  sanitizeConfig,
} from "./shared/filters.js";

const lowestHz = 20;
const highestHz = 20_000;
const topDb = 20;
const bottomDb = -20;
const spectrumFloorDb = -100;
const hitRadiusPx = 12;

const curve = document.getElementById("curve");
const context = curve.getContext("2d");
const bandsElement = document.getElementById("bands");
const levelElement = document.getElementById("level");
const statusElement = document.getElementById("status");
const captureButton = document.getElementById("capture");
const preampRange = document.getElementById("preamp");
const preampValue = document.getElementById("preampValue");
const enabledBox = document.getElementById("enabled");
const importPanel = document.getElementById("importPanel");
const autoEqText = document.getElementById("autoEqText");
const autoEqFile = document.getElementById("autoEqFile");
const importHint = document.getElementById("importHint");
const viewToggle = document.getElementById("viewToggle");
const bypassButton = document.getElementById("bypass");
const presetPanel = document.getElementById("presetPanel");
const presetName = document.getElementById("presetName");
const presetList = document.getElementById("presetList");
const presetJson = document.getElementById("presetJson");
const presetHint = document.getElementById("presetHint");
const searchText = document.getElementById("searchText");
const searchButton = document.getElementById("searchButton");
const searchResults = document.getElementById("searchResults");

const offlineContext = new OfflineAudioContext(1, 1, 48_000);

let config = defaultConfig();
let spectrumDb = [];
let levelDb = null;
let capturing = false;
let vertical = false;
let dragIndex = -1;
let curveDirty = true;
let curveDb = [];
let rowInputs = [];
let saveTimer = 0;

function layout() {
  const width = curve.clientWidth;
  const height = curve.clientHeight;
  return { width, height, padLeft: 26, padTop: 8, padRight: 8, padBottom: 14 };
}

function plotWidth(box) {
  return box.width - box.padLeft - box.padRight;
}

function plotHeight(box) {
  return box.height - box.padTop - box.padBottom;
}

function frequencyRatio(frequencyHz) {
  const span = Math.log10(highestHz) - Math.log10(lowestHz);
  return (Math.log10(frequencyHz) - Math.log10(lowestHz)) / span;
}

function ratioToFrequency(ratio) {
  const span = Math.log10(highestHz) - Math.log10(lowestHz);
  return clamp(lowestHz * 10 ** (ratio * span), lowestHz, highestHz);
}

// A point maps one frequency and one gain to a canvas position. The vertical view turns the axes a
// quarter turn, with the low frequencies at the top and the gain running left to right.
function makeAxis(box) {
  const width = plotWidth(box);
  const height = plotHeight(box);
  if (vertical) {
    return {
      point: (frequencyHz, gainDb) => ({
        x: box.padLeft + ((gainDb - bottomDb) / (topDb - bottomDb)) * width,
        y: box.padTop + frequencyRatio(frequencyHz) * height,
      }),
      place: (x, y) => ({
        frequencyHz: ratioToFrequency((y - box.padTop) / height),
        gainDb: clamp(bottomDb + ((x - box.padLeft) / width) * (topDb - bottomDb), bottomDb, topDb),
      }),
    };
  }
  return {
    point: (frequencyHz, gainDb) => ({
      x: box.padLeft + frequencyRatio(frequencyHz) * width,
      y: box.padTop + ((topDb - gainDb) / (topDb - bottomDb)) * height,
    }),
    place: (x, y) => ({
      frequencyHz: ratioToFrequency((x - box.padLeft) / width),
      gainDb: clamp(topDb - ((y - box.padTop) / height) * (topDb - bottomDb), bottomDb, topDb),
    }),
  };
}

function levelToX(db, box) {
  return box.padLeft + ((db - spectrumFloorDb) / (0 - spectrumFloorDb)) * plotWidth(box);
}

function spectrumToY(db, box) {
  return box.padTop + ((0 - db) / (0 - spectrumFloorDb)) * plotHeight(box);
}

function drawLine(x1, y1, x2, y2) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

function curveFrequencies() {
  const frequencies = new Float32Array(256);
  const span = Math.log10(highestHz) - Math.log10(lowestHz);
  for (let index = 0; index < frequencies.length; index += 1) {
    frequencies[index] = lowestHz * 10 ** ((index / (frequencies.length - 1)) * span);
  }
  return frequencies;
}

const frequencies = curveFrequencies();

function computeCurve() {
  const magnitudes = new Float32Array(frequencies.length).fill(1);
  const response = new Float32Array(frequencies.length);
  const phase = new Float32Array(frequencies.length);

  if (config.enabled) {
    for (const band of config.bands) {
      if (!band.on) continue;
      const filter = offlineContext.createBiquadFilter();
      filter.type = audioNodeType[band.type];
      filter.frequency.value = band.frequencyHz;
      filter.Q.value = band.q;
      if (hasGain(band.type)) filter.gain.value = band.gainDb;
      filter.getFrequencyResponse(frequencies, response, phase);
      for (let index = 0; index < magnitudes.length; index += 1) magnitudes[index] *= response[index];
    }
  }

  const preampDb = config.enabled ? config.preampDb : 0;
  curveDb = Array.from(magnitudes, (magnitude) => 20 * Math.log10(magnitude) + preampDb);
  curveDirty = false;
}

function drawGrid(box, axis) {
  context.strokeStyle = "rgba(255,255,255,0.06)";
  context.fillStyle = "rgba(255,255,255,0.32)";
  context.font = "9px -apple-system, sans-serif";

  for (const frequencyHz of [100, 1000, 10_000]) {
    const label = frequencyHz >= 1000 ? `${frequencyHz / 1000}k` : `${frequencyHz}`;
    const at = axis.point(frequencyHz, 0);
    if (vertical) {
      context.textAlign = "left";
      drawLine(box.padLeft, at.y, box.width - box.padRight, at.y);
      context.fillText(label, 4, at.y - 3);
    } else {
      context.textAlign = "center";
      drawLine(at.x, box.padTop, at.x, box.height - box.padBottom);
      context.fillText(label, at.x, box.height - 4);
    }
  }

  context.strokeStyle = "rgba(255,255,255,0.16)";
  const zero = axis.point(20, 0);
  if (vertical) drawLine(zero.x, box.padTop, zero.x, box.height - box.padBottom);
  else drawLine(box.padLeft, zero.y, box.width - box.padRight, zero.y);
}

function drawSpectrum(box, axis) {
  if (spectrumDb.length === 0) return;
  const points = spectrumDb.map((db, index) => ({
    frequencyHz: lowestHz * 1000 ** (index / (spectrumDb.length - 1)),
    db,
  }));

  context.beginPath();
  if (vertical) {
    context.moveTo(box.padLeft, box.padTop);
    for (const point of points) context.lineTo(levelToX(point.db, box), axis.point(point.frequencyHz, 0).y);
    context.lineTo(box.padLeft, box.padTop + plotHeight(box));
  } else {
    context.moveTo(box.padLeft, box.height - box.padBottom);
    for (const point of points) context.lineTo(axis.point(point.frequencyHz, 0).x, spectrumToY(point.db, box));
    context.lineTo(box.width - box.padRight, box.height - box.padBottom);
  }
  context.closePath();
  context.fillStyle = "rgba(91,140,255,0.14)";
  context.fill();
}

function drawCurveLine(box, axis) {
  context.beginPath();
  for (let index = 0; index < curveDb.length; index += 1) {
    const point = axis.point(frequencies[index], curveDb[index]);
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  context.strokeStyle = "#5b8cff";
  context.lineWidth = 2;
  context.stroke();
}

function bandPoint(band, axis) {
  return axis.point(band.frequencyHz, hasGain(band.type) ? band.gainDb : 0);
}

function drawPoints(axis) {
  context.fillStyle = "#b06bff";
  for (const band of config.bands) {
    const point = bandPoint(band, axis);
    context.beginPath();
    context.arc(point.x, point.y, 4, 0, Math.PI * 2);
    context.fill();
  }
}

function draw() {
  const box = layout();
  const ratio = window.devicePixelRatio || 1;
  if (curve.width !== Math.round(box.width * ratio)) {
    curve.width = Math.round(box.width * ratio);
    curve.height = Math.round(box.height * ratio);
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, box.width, box.height);

  if (curveDirty) computeCurve();
  const axis = makeAxis(box);
  drawGrid(box, axis);
  drawSpectrum(box, axis);
  drawCurveLine(box, axis);
  drawPoints(axis);
}

function frame() {
  draw();
  requestAnimationFrame(frame);
}

function sendConfigValue(value) {
  chrome.runtime.sendMessage({ type: "audio:config", config: value }).catch(() => {});
}

function sendConfig() {
  sendConfigValue(config);
}

function saveConfig() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.local.set({ config });
    sendConfig();
  }, 120);
}

function updateRow(index, band) {
  const inputs = rowInputs[index];
  if (!inputs) return;
  inputs.freq.value = band.frequencyHz;
  inputs.gain.value = band.gainDb;
  inputs.gain.disabled = !hasGain(band.type);
  inputs.q.value = band.q;
  inputs.on.checked = band.on;
  inputs.row.classList.toggle("off", !band.on);
}

function removeBand(band) {
  config.bands = config.bands.filter((item) => item !== band);
  renderBands();
  curveDirty = true;
  saveConfig();
}

function addBand(frequencyHz) {
  config.bands.push(newBand(frequencyHz));
  renderBands();
  curveDirty = true;
  saveConfig();
}

function makeBandRow(band, index) {
  const row = document.createElement("div");
  row.className = "band";

  const on = document.createElement("input");
  on.type = "checkbox";
  on.className = "on";
  on.checked = band.on;
  on.addEventListener("change", () => {
    band.on = on.checked;
    row.classList.toggle("off", !band.on);
    curveDirty = true;
    saveConfig();
  });

  const type = document.createElement("select");
  for (const name of bandTypes) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = typeLabels[name];
    type.append(option);
  }
  type.value = band.type;
  type.addEventListener("change", () => {
    band.type = type.value;
    updateRow(index, band);
    curveDirty = true;
    saveConfig();
  });

  const freq = document.createElement("input");
  freq.type = "number";
  freq.min = "20";
  freq.max = "20000";
  freq.value = band.frequencyHz;
  freq.addEventListener("input", () => {
    band.frequencyHz = clamp(Number(freq.value) || 1000, 20, 20_000);
    curveDirty = true;
    saveConfig();
  });

  const gain = document.createElement("input");
  gain.type = "number";
  gain.step = "0.1";
  gain.min = "-20";
  gain.max = "20";
  gain.value = band.gainDb;
  gain.disabled = !hasGain(band.type);
  gain.addEventListener("input", () => {
    band.gainDb = clamp(Number(gain.value) || 0, -20, 20);
    curveDirty = true;
    saveConfig();
  });

  const q = document.createElement("input");
  q.type = "number";
  q.step = "0.01";
  q.min = "0.1";
  q.max = "18";
  q.value = band.q;
  q.addEventListener("input", () => {
    band.q = clamp(Number(q.value) || 1, 0.1, 18);
    curveDirty = true;
    saveConfig();
  });

  const remove = document.createElement("button");
  remove.className = "remove";
  remove.textContent = "×";
  remove.addEventListener("click", () => removeBand(band));

  row.append(on, type, freq, gain, q, remove);
  row.classList.toggle("off", !band.on);
  rowInputs[index] = { row, on, type, freq, gain, q };
  return row;
}

function renderBands() {
  bandsElement.replaceChildren();
  rowInputs = [];
  config.bands.forEach((band, index) => bandsElement.append(makeBandRow(band, index)));
}

function applyConfigToUi() {
  enabledBox.checked = config.enabled;
  preampRange.value = config.preampDb;
  preampValue.textContent = (config.preampDb || 0).toFixed(1);
  renderBands();
  curveDirty = true;
}

function hitBand(x, y) {
  const axis = makeAxis(layout());
  for (let index = 0; index < config.bands.length; index += 1) {
    const point = bandPoint(config.bands[index], axis);
    if (Math.hypot(point.x - x, point.y - y) <= hitRadiusPx) return index;
  }
  return -1;
}

function pointerPosition(event) {
  const bounds = curve.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function moveBand(index, x, y) {
  const band = config.bands[index];
  const placed = makeAxis(layout()).place(x, y);
  band.frequencyHz = Math.round(placed.frequencyHz);
  if (hasGain(band.type)) band.gainDb = Math.round(placed.gainDb * 10) / 10;
  updateRow(index, band);
  curveDirty = true;
  saveConfig();
}

curve.addEventListener("pointerdown", (event) => {
  const position = pointerPosition(event);
  dragIndex = hitBand(position.x, position.y);
  if (dragIndex >= 0) {
    curve.setPointerCapture(event.pointerId);
    moveBand(dragIndex, position.x, position.y);
  }
});

curve.addEventListener("pointermove", (event) => {
  if (dragIndex < 0) return;
  const position = pointerPosition(event);
  moveBand(dragIndex, position.x, position.y);
});

curve.addEventListener("pointerup", () => {
  dragIndex = -1;
});

curve.addEventListener("wheel", (event) => {
  const position = pointerPosition(event);
  const index = hitBand(position.x, position.y);
  if (index < 0) return;
  event.preventDefault();
  const band = config.bands[index];
  band.q = clamp(band.q * (event.deltaY < 0 ? 1.1 : 1 / 1.1), 0.1, 18);
  updateRow(index, band);
  curveDirty = true;
  saveConfig();
});

curve.addEventListener("dblclick", (event) => {
  const position = pointerPosition(event);
  const index = hitBand(position.x, position.y);
  if (index >= 0) removeBand(config.bands[index]);
  else addBand(Math.round(makeAxis(layout()).place(position.x, position.y).frequencyHz));
});

function setStatus(text) {
  statusElement.textContent = text;
  statusElement.title = text;
}

function applyCaptureState(state) {
  if (!state) return;
  capturing = !!state.capturing;
  captureButton.textContent = capturing ? "Stop capture" : "Start capture";
  if (state.error) setStatus(state.error);
  else if (capturing) setStatus(state.title || "Capturing");
  else setStatus("No audio");
}

async function toggleCapture() {
  const state = await chrome.runtime.sendMessage({ type: capturing ? "capture:stop" : "capture:start" });
  applyCaptureState(state);
}

function applyAutoEq() {
  const parsed = parseAutoEq(autoEqText.value);
  if (parsed.bands.length === 0) {
    importHint.textContent = "No filters found in that text.";
    return;
  }
  parsed.enabled = config.enabled;
  config = parsed;
  applyConfigToUi();
  saveConfig();
  importHint.textContent = `Imported ${parsed.bands.length} bands.`;
}

let presets = {};

function persistPresets() {
  chrome.storage.local.set({ presets });
}

function renderPresets() {
  presetList.replaceChildren();
  const names = Object.keys(presets);
  if (names.length === 0) {
    const empty = document.createElement("span");
    empty.className = "empty";
    empty.textContent = "No presets yet.";
    presetList.append(empty);
    return;
  }
  for (const name of names) {
    const item = document.createElement("span");
    item.className = "chip-item";

    const load = document.createElement("button");
    load.textContent = name;
    load.addEventListener("click", () => loadPreset(name));

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.textContent = "×";
    remove.addEventListener("click", () => deletePreset(name));

    item.append(load, remove);
    presetList.append(item);
  }
}

function savePreset() {
  const name = presetName.value.trim();
  if (!name) {
    presetHint.textContent = "Give the preset a name.";
    return;
  }
  presets[name] = structuredClone(config);
  persistPresets();
  renderPresets();
  presetHint.textContent = `Saved ${name}.`;
}

function loadPreset(name) {
  config = sanitizeConfig(presets[name]);
  applyConfigToUi();
  saveConfig();
  presetHint.textContent = `Loaded ${name}.`;
}

function deletePreset(name) {
  delete presets[name];
  persistPresets();
  renderPresets();
}

function exportPreset() {
  presetJson.value = JSON.stringify(config, null, 2);
  presetHint.textContent = "The current EQ is in the box.";
}

function importPreset() {
  try {
    config = sanitizeConfig(JSON.parse(presetJson.value));
    applyConfigToUi();
    saveConfig();
    presetHint.textContent = "Applied the JSON.";
  } catch {
    presetHint.textContent = "That text is not valid JSON.";
  }
}

const autoEqBase = "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/";
const indexLifetimeMs = 7 * 24 * 60 * 60 * 1000;
let autoEqItems = null;

function parseAutoEqIndex(text) {
  const items = [];
  for (const line of text.split("\n")) {
    // The path can hold brackets of its own, such as "(ANC Off)", so it runs to the last ") by ".
    const match = line.match(/^- \[(.+?)\]\(\.\/(.+)\) by /);
    if (match) items.push({ name: match[1], path: match[2] });
  }
  return items;
}

async function loadAutoEqIndex() {
  if (autoEqItems) return autoEqItems;
  const cached = await chrome.storage.local.get(["autoEqIndex", "autoEqIndexAt"]);
  const isFresh = cached.autoEqIndexAt && Date.now() - cached.autoEqIndexAt < indexLifetimeMs;
  let text = isFresh ? cached.autoEqIndex : null;
  if (!text) {
    text = await (await fetch(`${autoEqBase}INDEX.md`)).text();
    await chrome.storage.local.set({ autoEqIndex: text, autoEqIndexAt: Date.now() });
  }
  autoEqItems = parseAutoEqIndex(text);
  return autoEqItems;
}

function renderSearchResults(items) {
  searchResults.replaceChildren();
  for (const item of items) {
    const button = document.createElement("button");
    button.className = "quiet";
    button.textContent = item.name;
    button.addEventListener("click", () => applySearchResult(item));
    searchResults.append(button);
  }
}

async function applySearchResult(item) {
  importHint.textContent = `Loading ${item.name}...`;
  const file = encodeURIComponent(`${item.name} ParametricEQ.txt`);
  const response = await fetch(`${autoEqBase}${item.path}/${file}`).catch(() => null);
  if (!response || !response.ok) {
    importHint.textContent = `${item.name} did not load. Check the network and try again.`;
    return;
  }
  autoEqText.value = await response.text();
  applyAutoEq();
  importHint.textContent = `Loaded ${item.name}.`;
}

async function searchHeadphones() {
  const query = searchText.value.trim().toLowerCase();
  if (!query) return;
  importHint.textContent = "Searching...";
  const items = await loadAutoEqIndex();
  const matches = items.filter((item) => item.name.toLowerCase().includes(query)).slice(0, 20);
  renderSearchResults(matches);
  importHint.textContent = matches.length ? `${matches.length} matches.` : "No match for that name.";
}

function exportAutoEq() {
  autoEqText.value = toAutoEq(config);
  importHint.textContent = "The current EQ is in the box. Copy it out.";
}

preampRange.addEventListener("input", () => {
  config.preampDb = Number(preampRange.value);
  preampValue.textContent = config.preampDb.toFixed(1);
  curveDirty = true;
  saveConfig();
});

enabledBox.addEventListener("change", () => {
  config.enabled = enabledBox.checked;
  curveDirty = true;
  saveConfig();
});

captureButton.addEventListener("click", () => {
  toggleCapture();
});

document.getElementById("addBand").addEventListener("click", () => addBand(1000));
document.getElementById("viewToggle").addEventListener("click", () => {
  vertical = !vertical;
  viewToggle.textContent = vertical ? "↕" : "↔";
  dragIndex = -1;
  chrome.storage.local.set({ view: vertical ? "vertical" : "horizontal" });
});
document.getElementById("importToggle").addEventListener("click", () => {
  importPanel.hidden = !importPanel.hidden;
});
document.getElementById("applyAutoEq").addEventListener("click", applyAutoEq);
document.getElementById("exportAutoEq").addEventListener("click", exportAutoEq);
searchButton.addEventListener("click", searchHeadphones);
searchText.addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchHeadphones();
});

document.getElementById("presetToggle").addEventListener("click", () => {
  presetPanel.hidden = !presetPanel.hidden;
});
document.getElementById("presetSave").addEventListener("click", savePreset);
document.getElementById("presetExport").addEventListener("click", exportPreset);
document.getElementById("presetImport").addEventListener("click", importPreset);

function endBypass() {
  bypassButton.classList.remove("on");
  sendConfig();
}

bypassButton.addEventListener("pointerdown", () => {
  bypassButton.classList.add("on");
  sendConfigValue({ ...config, enabled: false });
});
bypassButton.addEventListener("pointerup", endBypass);
bypassButton.addEventListener("pointerleave", endBypass);

autoEqFile.addEventListener("change", async () => {
  const file = autoEqFile.files[0];
  if (file) autoEqText.value = await file.text();
});

chrome.runtime.onMessage.addListener((message) => {
  if (!message || !message.type) return false;
  if (message.type === "capture:state") {
    applyCaptureState(message.state);
    return false;
  }
  if (message.type !== "audio:telemetry") return false;
  levelDb = message.levelDb;
  spectrumDb = message.spectrumDb;
  levelElement.textContent = levelDb <= -120 ? "--" : levelDb.toFixed(1);
  return false;
});

async function hydrate() {
  const stored = await chrome.storage.local.get(["config", "view", "presets"]);
  if (stored.config) config = sanitizeConfig(stored.config);
  presets = stored.presets || {};
  vertical = stored.view === "vertical";
  viewToggle.textContent = vertical ? "↕" : "↔";
  applyConfigToUi();
  renderPresets();
  sendConfig();

  const session = await chrome.storage.session.get("capture");
  applyCaptureState(session.capture);

  frame();
}

hydrate();

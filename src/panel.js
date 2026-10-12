import {
  bandTypes,
  typeLabels,
  audioNodeType,
  hasGain,
  clamp,
  defaultConfig,
  newBand,
  parseAutoEq,
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

const offlineContext = new OfflineAudioContext(1, 1, 48_000);

let config = defaultConfig();
let spectrumDb = [];
let levelDb = null;
let capturing = false;
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

function frequencyToX(frequencyHz, box) {
  const span = Math.log10(highestHz) - Math.log10(lowestHz);
  const at = (Math.log10(frequencyHz) - Math.log10(lowestHz)) / span;
  return box.padLeft + at * (box.width - box.padLeft - box.padRight);
}

function xToFrequency(x, box) {
  const span = Math.log10(highestHz) - Math.log10(lowestHz);
  const at = (x - box.padLeft) / (box.width - box.padLeft - box.padRight);
  return clamp(lowestHz * 10 ** (at * span), lowestHz, highestHz);
}

function dbToY(db, box) {
  const at = (topDb - db) / (topDb - bottomDb);
  return box.padTop + at * (box.height - box.padTop - box.padBottom);
}

function yToDb(y, box) {
  const at = (y - box.padTop) / (box.height - box.padTop - box.padBottom);
  return clamp(topDb - at * (topDb - bottomDb), bottomDb, topDb);
}

function spectrumToY(db, box) {
  const at = (0 - db) / (0 - spectrumFloorDb);
  return box.padTop + at * (box.height - box.padTop - box.padBottom);
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

function drawGrid(box) {
  context.strokeStyle = "rgba(255,255,255,0.06)";
  context.fillStyle = "rgba(255,255,255,0.32)";
  context.font = "9px -apple-system, sans-serif";
  context.textAlign = "center";
  for (const frequencyHz of [100, 1000, 10_000]) {
    const x = frequencyToX(frequencyHz, box);
    context.beginPath();
    context.moveTo(x, box.padTop);
    context.lineTo(x, box.height - box.padBottom);
    context.stroke();
    context.fillText(frequencyHz >= 1000 ? `${frequencyHz / 1000}k` : `${frequencyHz}`, x, box.height - 4);
  }
  const zeroY = dbToY(0, box);
  context.strokeStyle = "rgba(255,255,255,0.16)";
  context.beginPath();
  context.moveTo(box.padLeft, zeroY);
  context.lineTo(box.width - box.padRight, zeroY);
  context.stroke();
}

function drawSpectrum(box) {
  if (spectrumDb.length === 0) return;
  context.beginPath();
  context.moveTo(box.padLeft, box.height - box.padBottom);
  for (let index = 0; index < spectrumDb.length; index += 1) {
    const frequencyHz = lowestHz * 1000 ** (index / (spectrumDb.length - 1));
    context.lineTo(frequencyToX(frequencyHz, box), spectrumToY(spectrumDb[index], box));
  }
  context.lineTo(box.width - box.padRight, box.height - box.padBottom);
  context.closePath();
  context.fillStyle = "rgba(91,140,255,0.14)";
  context.fill();
}

function drawCurveLine(box) {
  context.beginPath();
  for (let index = 0; index < curveDb.length; index += 1) {
    const point = [frequencyToX(frequencies[index], box), dbToY(curveDb[index], box)];
    if (index === 0) context.moveTo(point[0], point[1]);
    else context.lineTo(point[0], point[1]);
  }
  context.strokeStyle = "#5b8cff";
  context.lineWidth = 2;
  context.stroke();
}

function bandPoint(band, box) {
  const gainDb = hasGain(band.type) ? band.gainDb : 0;
  return { x: frequencyToX(band.frequencyHz, box), y: dbToY(gainDb, box) };
}

function drawPoints(box) {
  context.fillStyle = "#b06bff";
  for (const band of config.bands) {
    const point = bandPoint(band, box);
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
  drawGrid(box);
  drawSpectrum(box);
  drawCurveLine(box);
  drawPoints(box);
}

function frame() {
  draw();
  requestAnimationFrame(frame);
}

function sendConfig() {
  chrome.runtime.sendMessage({ type: "audio:config", config }).catch(() => {});
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

function hitBand(x, y) {
  const box = layout();
  for (let index = 0; index < config.bands.length; index += 1) {
    const point = bandPoint(config.bands[index], box);
    if (Math.hypot(point.x - x, point.y - y) <= hitRadiusPx) return index;
  }
  return -1;
}

function pointerPosition(event) {
  const bounds = curve.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function moveBand(index, x, y) {
  const box = layout();
  const band = config.bands[index];
  band.frequencyHz = Math.round(xToFrequency(x, box));
  if (hasGain(band.type)) band.gainDb = Math.round(yToDb(y, box) * 10) / 10;
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
  else addBand(Math.round(xToFrequency(position.x, layout())));
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
  preampRange.value = config.preampDb;
  preampValue.textContent = config.preampDb.toFixed(1);
  renderBands();
  curveDirty = true;
  saveConfig();
  importHint.textContent = `Imported ${parsed.bands.length} bands.`;
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
document.getElementById("importToggle").addEventListener("click", () => {
  importPanel.hidden = !importPanel.hidden;
});
document.getElementById("applyAutoEq").addEventListener("click", applyAutoEq);

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
  const stored = await chrome.storage.local.get("config");
  if (stored.config) config = { ...defaultConfig(), ...stored.config };
  enabledBox.checked = config.enabled;
  preampRange.value = config.preampDb;
  preampValue.textContent = (config.preampDb || 0).toFixed(1);
  renderBands();
  curveDirty = true;
  sendConfig();

  const session = await chrome.storage.session.get("capture");
  applyCaptureState(session.capture);

  frame();
}

hydrate();

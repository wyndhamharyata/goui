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
const viewToggle = document.getElementById("viewToggle");

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
  const stored = await chrome.storage.local.get(["config", "view"]);
  if (stored.config) config = { ...defaultConfig(), ...stored.config };
  vertical = stored.view === "vertical";
  viewToggle.textContent = vertical ? "↕" : "↔";
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

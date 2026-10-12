import { biquadQ, engineConfig, hasGain, makeBiquad, sanitizeConfig } from "./shared/filters.js";

let audioContext;
let mediaStream;
let sourceNode;
let chainNodes = [];
let analyserNode;
let preampNode;
let filterNodes = [];
let telemetryTimer;
let config = { enabled: true, preampDb: 0, bands: [] };

const spectrumPoints = 128;
const offlineContext = new OfflineAudioContext(1, 1, 48_000);

function gainFromDb(gainDb) {
  return 10 ** (gainDb / 20);
}

function activeBands() {
  return config.bands.filter((band) => band.on);
}

function buildChain() {
  sourceNode.disconnect();
  for (const node of chainNodes) node.disconnect();
  chainNodes = [];
  filterNodes = [];

  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 8192;
  analyserNode.smoothingTimeConstant = 0;

  if (!config.enabled) {
    sourceNode.connect(analyserNode);
    analyserNode.connect(audioContext.destination);
    chainNodes = [analyserNode];
    return;
  }

  let node = sourceNode;
  preampNode = audioContext.createGain();
  preampNode.gain.value = gainFromDb(config.preampDb);
  node.connect(preampNode);
  node = preampNode;

  for (const band of activeBands()) {
    const filter = makeBiquad(audioContext, band);
    node.connect(filter);
    node = filter;
    filterNodes.push(filter);
  }

  node.connect(analyserNode);
  analyserNode.connect(audioContext.destination);
  chainNodes = [preampNode, ...filterNodes, analyserNode];
}

// Only a change here needs new nodes. A new frequency, gain or Q moves the nodes that exist.
function chainLayout() {
  const parts = config.bands.map((band) => [band.type, band.on]);
  return JSON.stringify([parts, config.enabled]);
}

function updateFilters() {
  const now = audioContext.currentTime;
  const rampSeconds = 0.01;
  preampNode.gain.setTargetAtTime(gainFromDb(config.preampDb), now, rampSeconds);
  activeBands().forEach((band, index) => {
    const filter = filterNodes[index];
    filter.frequency.setTargetAtTime(band.frequencyHz, now, rampSeconds);
    filter.Q.setTargetAtTime(biquadQ(band), now, rampSeconds);
    if (hasGain(band.type)) filter.gain.setTargetAtTime(band.gainDb, now, rampSeconds);
  });
}

function applyConfig(next) {
  const previous = chainLayout();
  config = next;
  if (!audioContext) return;
  if (chainLayout() !== previous) {
    buildChain();
    return;
  }
  if (config.enabled) updateFilters();
}

function readLevelDb(buffer) {
  analyserNode.getFloatTimeDomainData(buffer);
  let sum = 0;
  for (const sample of buffer) sum += sample * sample;
  const rms = Math.sqrt(sum / buffer.length);
  return rms > 0 ? Math.max(20 * Math.log10(rms), -120) : -120;
}

function readSpectrum(bins) {
  analyserNode.getFloatFrequencyData(bins);
  const hzPerBin = audioContext.sampleRate / analyserNode.fftSize;
  const points = [];
  for (let index = 0; index < spectrumPoints; index += 1) {
    const frequencyHz = 20 * 1000 ** (index / (spectrumPoints - 1));
    const bin = Math.min(Math.round(frequencyHz / hzPerBin), bins.length - 1);
    points.push(Number.isFinite(bins[bin]) ? bins[bin] : -120);
  }
  return points;
}

function sendTelemetry() {
  const levelDb = readLevelDb(new Float32Array(analyserNode.fftSize));
  const spectrumDb = readSpectrum(new Float32Array(analyserNode.frequencyBinCount));
  chrome.runtime
    .sendMessage({ type: "audio:telemetry", levelDb, spectrumDb })
    .catch(() => {});
}

async function start(streamId) {
  await stop();
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
  });
  audioContext = new AudioContext();
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  buildChain();
  telemetryTimer = setInterval(sendTelemetry, 50);
  return { ok: true };
}

async function stop() {
  if (telemetryTimer) clearInterval(telemetryTimer);
  telemetryTimer = undefined;
  if (mediaStream) for (const track of mediaStream.getTracks()) track.stop();
  mediaStream = undefined;
  if (audioContext) await audioContext.close().catch(() => {});
  audioContext = undefined;
  chainNodes = [];
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || !message.type) return false;
  if (message.type === "audio:start") {
    start(message.streamId).then(respond, (error) => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "audio:stop") {
    stop().then(respond, (error) => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "audio:config") {
    applyConfig(engineConfig(sanitizeConfig(message.config), offlineContext));
    respond({ ok: true });
    return true;
  }
  return false;
});

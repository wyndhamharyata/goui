import { audioNodeType, bandTypes, hasGain } from "./shared/filters.js";

let audioContext;
let mediaStream;
let sourceNode;
let chainNodes = [];
let analyserNode;
let preampNode;
let telemetryTimer;
let config = { enabled: true, preampDb: 0, limiter: false, bands: [] };

const spectrumPoints = 128;

function gainFromDb(gainDb) {
  return 10 ** (gainDb / 20);
}

function buildChain() {
  for (const node of chainNodes) node.disconnect();
  chainNodes = [];

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

  for (const band of config.bands) {
    if (!band.on || !bandTypes.includes(band.type)) continue;
    const filter = audioContext.createBiquadFilter();
    filter.type = audioNodeType[band.type];
    filter.frequency.value = band.frequencyHz;
    filter.Q.value = band.q;
    if (hasGain(band.type)) filter.gain.value = band.gainDb;
    node.connect(filter);
    node = filter;
  }

  if (config.limiter) {
    const limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    node.connect(limiter);
    node = limiter;
  }

  node.connect(analyserNode);
  analyserNode.connect(audioContext.destination);
  chainNodes = [preampNode, analyserNode];
}

function bandSignature() {
  const parts = config.bands.map((band) => [band.type, band.frequencyHz, band.gainDb, band.q, band.on]);
  return JSON.stringify([parts, config.limiter, config.enabled]);
}

function applyConfig(next) {
  const previous = bandSignature();
  config = next;
  if (!audioContext) return;
  if (bandSignature() !== previous) {
    buildChain();
    return;
  }
  preampNode.gain.setTargetAtTime(gainFromDb(config.preampDb), audioContext.currentTime, 0.02);
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
    .sendMessage({ type: "audio:telemetry", levelDb: levelDb, spectrumDb: spectrumDb, sampleRateHz: audioContext.sampleRate })
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
  return { ok: true, sampleRateHz: audioContext.sampleRate };
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
    applyConfig(message.config);
    respond({ ok: true, bands: config.bands.length });
    return true;
  }
  return false;
});

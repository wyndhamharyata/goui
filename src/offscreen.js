import { biquadQ, engineConfig, hasGain, logSweepHz, makeBiquad, sanitizeConfig } from "./shared/filters.js";
import { messageTypes, trySendMessage } from "./shared/messages.js";

/** @typedef {import("./shared/messages.js").AudioReply} AudioReply */

let audioContext;
let mediaStream;
let sourceNode;
let chainNodes = [];
let analyserNode;
let preampNode;
let bandNodes = [];
let telemetryTimer;
let config = { enabled: true, preampDb: 0, bands: [] };

// The panel reads these points back on the same log scale.
const spectrumHz = logSweepHz(128);

/** @returns {import("./shared/filters.js").Band[]} */
function listActiveBands() {
  return config.bands.filter((band) => band.on);
}

function buildChain() {
  sourceNode.disconnect();
  for (const node of chainNodes) node.disconnect();

  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 8192;
  analyserNode.smoothingTimeConstant = 0;
  preampNode = audioContext.createGain();
  preampNode.gain.value = 10 ** (config.preampDb / 20);

  // With the EQ off, the tab plays straight into the analyser, so the level still reads.
  bandNodes = [];
  chainNodes = [analyserNode];
  if (config.enabled) {
    bandNodes = listActiveBands().map((band) => makeBiquad(audioContext, band));
    chainNodes = [preampNode, ...bandNodes, analyserNode];
  }
  const path = [sourceNode, ...chainNodes, audioContext.destination];
  for (let index = 1; index < path.length; index += 1) path[index - 1].connect(path[index]);
}

// Only a change here needs new nodes. A new frequency, gain or Q moves the nodes that exist.
/** @returns {string} */
function readChainLayout() {
  const parts = config.bands.map((band) => [band.type, band.on]);
  return JSON.stringify([parts, config.enabled]);
}

function updateBandNodes() {
  const now = audioContext.currentTime;
  const rampSeconds = 0.01;
  preampNode.gain.setTargetAtTime(10 ** (config.preampDb / 20), now, rampSeconds);
  listActiveBands().forEach((band, index) => {
    const bandNode = bandNodes[index];
    bandNode.frequency.setTargetAtTime(band.frequencyHz, now, rampSeconds);
    bandNode.Q.setTargetAtTime(biquadQ(band), now, rampSeconds);
    if (hasGain(band.type)) bandNode.gain.setTargetAtTime(band.gainDb, now, rampSeconds);
  });
}

function applyConfig(next) {
  const previous = readChainLayout();
  config = next;
  if (!audioContext) return;
  if (readChainLayout() !== previous) {
    buildChain();
    return;
  }
  if (config.enabled) updateBandNodes();
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
  for (const frequencyHz of spectrumHz) {
    const bin = Math.min(Math.round(frequencyHz / hzPerBin), bins.length - 1);
    points.push(Number.isFinite(bins[bin]) ? bins[bin] : -120);
  }
  return points;
}

function sendTelemetry() {
  const levelDb = readLevelDb(new Float32Array(analyserNode.fftSize));
  const spectrumDb = readSpectrum(new Float32Array(analyserNode.frequencyBinCount));
  trySendMessage({ type: messageTypes.audioTelemetry, levelDb, spectrumDb });
}

/**
 * @param {string} streamId
 * @returns {Promise<AudioReply>}
 */
async function start(streamId) {
  await stop();
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
  });
  audioContext = new AudioContext();
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  buildChain();
  const telemetryIntervalMs = 50;
  telemetryTimer = setInterval(sendTelemetry, telemetryIntervalMs);
  return { ok: true };
}

/** @returns {Promise<AudioReply>} */
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

/** @type {Map<string, (message: import("./shared/messages.js").Message) => Promise<AudioReply>>} */
const handlers = new Map([
  [messageTypes.audioStart, (message) => start(message.streamId)],
  [messageTypes.audioStop, () => stop()],
  [messageTypes.audioConfig, async (message) => {
    applyConfig(engineConfig(sanitizeConfig(message.config)));
    return { ok: true };
  }],
]);

// Every handler answers with a reply, or with the error that stopped it.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const handle = message && handlers.get(message.type);
  if (!handle) return false;
  handle(message).then(respond, (error) => respond({ ok: false, error: error.message }));
  return true;
});

// The stored config, and makePlayedSound, which merges the layers that are on with the sliders and preamp.
import { autoEqBassShelfHz, autoPreampDb, butterworthQ, cleanBands, hasGain } from "./bands.js";
import { clamp } from "./math.js";

/** @typedef {import("./bands.js").Band} Band */

/** @typedef {"headphone" | "ear"} LayerRole */

/**
 * @typedef {object} Layer
 * @property {boolean} on
 * @property {string} source
 * @property {string} name
 * @property {boolean} isEdited
 * @property {Band[]} bands
 * @property {AutoEqOrigin} [autoEq]
 */

/** @typedef {{ name: string, path: string, target: string }} AutoEqOrigin */

/** @typedef {{ bassDb: number, vocalsDb: number, trebleDb: number }} Sliders */

/**
 * @typedef {object} Config
 * @property {boolean} enabled
 * @property {number} preampDb
 * @property {boolean} autoPreamp
 * @property {Sliders} sliders
 * @property {{ headphone: Layer, ear?: Layer }} layers
 */

/** @typedef {{ enabled: boolean, preampDb: number, bands: Band[] }} PlayedSound */

/** @typedef {{ role: LayerRole, bands: Band[] }} LayerBands */

export const sliderRangeDb = [-6, 6];
export const preampRangeDb = [-24, 12];

export const layerOrder = ["headphone", "ear"];
export const layerLabels = { headphone: "Headphone", ear: "My ear" };

/**
 * @param {string} name
 * @param {string} source
 * @param {Band[]} [bands]
 * @returns {Layer}
 */
export function makeLayer(name, source, bands = []) {
  return { on: true, source, name, isEdited: false, bands };
}

export const flatSliders = { bassDb: 0, vocalsDb: 0, trebleDb: 0 };

/** @returns {Config} */
export function defaultConfig() {
  return {
    enabled: true,
    preampDb: 0,
    autoPreamp: true,
    sliders: { ...flatSliders },
    layers: { headphone: makeLayer("Flat", "Starter sound") },
  };
}

/**
 * @param {unknown} raw
 * @param {string} fallbackName
 * @returns {Layer}
 */
function cleanLayer(raw, fallbackName) {
  const layer = {
    on: !raw || raw.on !== false,
    source: raw && typeof raw.source === "string" ? raw.source : "Sound",
    name: raw && typeof raw.name === "string" ? raw.name : fallbackName,
    isEdited: Boolean(raw && raw.isEdited),
    bands: cleanBands(raw && raw.bands),
  };
  const autoEq = raw && raw.autoEq;
  const isAutoEq = Boolean(autoEq) && ["name", "path", "target"].every((key) => typeof autoEq[key] === "string");
  if (isAutoEq) layer.autoEq = { name: autoEq.name, path: autoEq.path, target: autoEq.target };

  return layer;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function cleanSliderDb(value) {
  return clamp(Number(value) || 0, ...sliderRangeDb);
}

// Used on a stored config and on an imported saved sound, so a bad file cannot reach the audio chain.
/**
 * @param {unknown} raw
 * @returns {Config}
 */
export function sanitizeConfig(raw) {
  if (!raw || typeof raw !== "object") return defaultConfig();

  const sliders = raw.sliders || raw.macros || {};

  // An older config holds one flat list, named by soundName or profileName. It becomes the headphone layer.
  const older = {
    headphone: {
      on: true,
      source: raw.soundKind ?? raw.profileKind,
      name: raw.soundName ?? raw.profileName,
      isEdited: raw.isEdited,
      bands: raw.bands,
    },
  };
  const storedLayers = raw.layers || older;
  const layers = { headphone: cleanLayer(storedLayers.headphone, "Flat") };
  if (storedLayers.ear) layers.ear = cleanLayer(storedLayers.ear, "Ear tuning");

  return {
    enabled: raw.enabled !== false,
    preampDb: clamp(Number(raw.preampDb) || 0, ...preampRangeDb),
    autoPreamp: raw.autoPreamp !== false,
    sliders: { bassDb: cleanSliderDb(sliders.bassDb), vocalsDb: cleanSliderDb(sliders.vocalsDb), trebleDb: cleanSliderDb(sliders.trebleDb) },
    layers,
  };
}

// Every layer that is on, in a fixed order. The engine plays these, and the panel draws them.
/**
 * @param {Config} config
 * @returns {LayerBands[]}
 */
export function listOnLayers(config) {
  return layerOrder
    .filter((role) => config.layers[role] && config.layers[role].on)
    .map((role) => ({ role, bands: config.layers[role].bands }));
}

// The Listen sliders stay in the chain at 0 dB, so moving one never rebuilds the audio nodes.
function sliderBands(sliders) {
  return [
    { on: true, type: "LSC", frequencyHz: autoEqBassShelfHz, gainDb: sliders.bassDb, q: butterworthQ },
    { on: true, type: "PK", frequencyHz: 2500, gainDb: sliders.vocalsDb, q: 0.9 },
    { on: true, type: "HSC", frequencyHz: 8000, gainDb: sliders.trebleDb, q: butterworthQ },
  ];
}

// Every layer that is on, then the sliders on top.
/**
 * @param {Config} config
 * @returns {Band[]}
 */
export function listPlayedBands(config) {
  return [...listOnLayers(config).flatMap((layer) => layer.bands), ...sliderBands(config.sliders)];
}

// What the audio chain plays, the played bands and the preamp.
/**
 * @param {Config} config
 * @returns {PlayedSound}
 */
export function makePlayedSound(config) {
  const bands = listPlayedBands(config);
  const preampDb = config.autoPreamp ? autoPreampDb(bands) : config.preampDb;
  return { enabled: config.enabled, preampDb, bands };
}

// Export writes one flat file, so another app can read the merged sound.
/**
 * @param {Config} config
 * @returns {Band[]}
 */
export function listExportBands(config) {
  return listPlayedBands(config).filter((band) => !hasGain(band.type) || band.gainDb !== 0);
}

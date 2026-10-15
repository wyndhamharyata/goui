// The band choice, the sound you hear with A/B and Solo, and every change to the layers.
import { cleanBands, newBand } from "../shared/bands.js";
import { flatSliders, layerOrder, listOnLayers, listPlayedBands, newLayer, toPlayedSound } from "../shared/config.js";
import { messageTypes, trySendMessage } from "../shared/messages.js";
import { debounce } from "./dom.js";
import { refresh } from "./refresh.js";
import { layerSources, state } from "./state.js";

/** @typedef {import("../shared/bands.js").Band} Band */

/** @typedef {import("../shared/config.js").Config} Config */

/** @typedef {import("../shared/config.js").Layer} Layer */

/** @typedef {import("../shared/config.js").LayerRole} LayerRole */

/** @typedef {import("../shared/config.js").LayerBands} LayerBands */

/** @typedef {import("../shared/config.js").AutoEqOrigin} AutoEqOrigin */

/** @typedef {import("../graph/graph.js").BandEntry} BandEntry */

/** @typedef {{ name: string, source: string, bands: Band[], preampDb?: number, autoEq?: AutoEqOrigin }} NewLayer */

const storageWaitMs = 120;
const newLayerNames = { ear: "My ear tuning", taste: "My taste" };

/**
 * @param {Layer | undefined} layer
 * @returns {Band[]}
 */
export function readBands(layer) {
  return layer ? layer.bands : [];
}

// Every band in layer order, with its layer. The graph, the chips and the table number bands by this list.
/** @returns {BandEntry[]} */
export function listBandEntries() {
  return layerOrder.flatMap((role) => readBands(state.config.layers[role]).map((band) => ({ role, band })));
}

/** @returns {number} */
export function readSelectedIndex() {
  return listBandEntries().findIndex((entry) => entry.band === state.selectedBand);
}

/** @returns {LayerRole | undefined} */
export function readSelectedRole() {
  const entry = listBandEntries().find((each) => each.band === state.selectedBand);
  return entry && entry.role;
}

// An index past the list, such as -1, chooses no band.
/** @param {number} index */
export function selectBand(index) {
  const entry = listBandEntries()[index];

  state.selectedBand = entry ? entry.band : null;
  refresh();
}

// A new layer holds new band objects, so neither the choice nor Solo can point into it.
/** @returns {void} */
export function dropBandChoice() {
  state.selectedBand = null;
  state.soloBand = null;
}

// Holding A/B and the main switch both silence the EQ. The graph then draws a flat line.
/** @returns {boolean} */
export function isEqOff() {
  return state.isComparing || !state.config.enabled;
}

/**
 * @param {(layer: Layer) => Layer} change
 * @returns {Config["layers"]}
 */
function mapLayers(change) {
  const layers = {};

  for (const role of layerOrder) if (state.config.layers[role]) layers[role] = change(state.config.layers[role]);

  return layers;
}

// Level match plays the preamp the EQ uses with every band off. Auto would set 0 dB for no bands.
function readPreampOnlyConfig() {
  const layers = mapLayers((layer) => ({ ...layer, on: false }));
  return { ...state.config, layers, sliders: flatSliders, autoPreamp: false, preampDb: toPlayedSound(state.config).preampDb };
}

function readSoloConfig() {
  const layers = mapLayers((layer) => ({ ...layer, on: true, bands: layer.bands.map((band) => ({ ...band, on: band === state.soloBand })) }));
  return { ...state.config, layers, sliders: flatSliders };
}

// The config the engine plays and the graph draws, with A/B and Solo applied. A/B wins over Solo.
/** @returns {Config} */
export function readHeardConfig() {
  if (state.isComparing) return state.isLevelMatched ? readPreampOnlyConfig() : { ...state.config, enabled: false };

  return state.soloBand ? readSoloConfig() : state.config;
}

/** @returns {Band[]} */
export function listCurveBands() {
  const heard = readHeardConfig();
  return heard.enabled ? listPlayedBands(heard) : [];
}

// Each layer's own curve, for the dashed lines under the total. Solo and A/B draw none.
/** @returns {LayerBands[]} */
export function listCurveLayers() {
  return isEqOff() || state.soloBand ? [] : listOnLayers(state.config);
}

/** @returns {void} */
export function sendAudio() {
  trySendMessage({ type: messageTypes.audioConfig, config: readHeardConfig() });
}

const storeConfig = debounce(() => chrome.storage.local.set({ config: state.config }), storageWaitMs);

// The sound follows every edit at once. Only the storage write waits for the edits to pause.
/** @returns {void} */
export function commit() {
  sendAudio();
  storeConfig();
  refresh();
}

// A layer whose bands changed shows "edited", so you can tell it from the preset you picked.
/** @param {LayerRole | undefined} role */
export function markEdited(role) {
  if (role && state.config.layers[role]) state.config.layers[role].isEdited = true;
}

/** @returns {void} */
export function commitBandEdit() {
  markEdited(readSelectedRole());
  commit();
}

/**
 * @param {LayerRole} role
 * @param {number} frequencyHz
 * @param {number} gainDb
 */
export function addBandToLayer(role, frequencyHz, gainDb) {
  // The headphone layer is always there. The ear and taste layers start with their first band.
  if (role !== "headphone") state.config.layers[role] ??= newLayer(newLayerNames[role], layerSources.yourBands);

  const band = { ...newBand(frequencyHz), gainDb };

  state.config.layers[role].bands.push(band);
  state.selectedBand = band;
  markEdited(role);
  commit();
}

/** @returns {void} */
export function deleteSelectedBand() {
  const role = readSelectedRole();
  const layer = state.config.layers[role];

  layer.bands.splice(layer.bands.indexOf(state.selectedBand), 1);

  if (state.soloBand === state.selectedBand) state.soloBand = null;

  state.selectedBand = null;
  markEdited(role);
  commit();
}

/** @param {LayerRole} role */
export function removeLayer(role) {
  delete state.config.layers[role];
  dropBandChoice();
  commit();
}

// A lone headphone file needs its own preamp, so it is kept. Auto preamp overrides it either way.
/**
 * @param {NewLayer} sound
 * @param {LayerRole} role
 */
export function replaceLayer(sound, role) {
  state.config.layers[role] = newLayer(sound.name, sound.source, cleanBands(sound.bands));

  if (sound.autoEq) state.config.layers[role].autoEq = sound.autoEq;
  if (role === "headphone" && sound.preampDb !== undefined) state.config.preampDb = sound.preampDb;

  dropBandChoice();
  commit();
}

/** @param {boolean} isOn */
export function setComparing(isOn) {
  if (state.isComparing === isOn) return;

  state.isComparing = isOn;
  sendAudio();
  refresh();
}

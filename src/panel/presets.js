// Your presets: the card at the top of each Library section, deleting a preset, and reading them.
import { cleanBands } from "../shared/bands.js";
import { emptyLayerNames, layerOrder, layerSources, sanitizeConfig } from "../shared/config.js";
import { storageKeys } from "../shared/storage.js";
import { buildListRow, partOf, renderPlayingRows, sectionOf } from "./dom.js";
import { describeBandCount, describeLayerName } from "./items.js";
import { onRefresh, renderPresetList } from "./refresh.js";
import { commit, replaceLayer } from "./sound.js";
import { state } from "./state.js";

/** @typedef {import("../shared/config.js").LayerRole} LayerRole */

// The one rule for "this layer plays that preset". An edit or a switched-off layer still counts.
/**
 * @param {LayerRole} role
 * @param {string} name
 * @returns {boolean}
 */
export function isPresetInLayer(role, name) {
  const layer = state.config.layers[role];
  return Boolean(layer) && layer.source === layerSources.saved && layer.name === name && Object.hasOwn(state.presets[role], name);
}

/**
 * @param {LayerRole} role
 * @returns {boolean}
 */
export function isSavedPreset(role) {
  const layer = state.config.layers[role];
  return Boolean(layer) && isPresetInLayer(role, layer.name);
}

// Each Library section shows what plays in its layer now, and whether that is one of your presets.
function renderPresetCard(role) {
  const layer = state.config.layers[role];
  const isSaved = isSavedPreset(role);
  let caption = "Nothing yet";

  if (layer) caption = isSaved ? "Your preset" : `${layer.source}, not saved yet`;

  partOf(role, "current-caption").textContent = caption;
  partOf(role, "current-name").textContent = layer ? describeLayerName(layer) : emptyLayerNames[role];

  const save = partOf(role, "save");
  const hasNothingNew = isSaved && !layer.isEdited;

  save.textContent = isSaved ? "Save changes" : "Save";
  save.disabled = !layer || hasNothingNew;
  partOf(role, "save-as").disabled = !layer;
  renderPlayingRows(sectionOf(role));
}

/** @returns {void} */
export function renderPresetCards() {
  for (const role of layerOrder) renderPresetCard(role);
}

/** @param {LayerRole} role */
export function storePresets(role) {
  chrome.storage.local.set({ [storageKeys.presets[role]]: state.presets[role] });
  renderPresetList(role);
}

// The layer keeps its bands. It is no longer a saved preset, so Save asks for a name again.
function deletePreset(role, name) {
  const isPlaying = isPresetInLayer(role, name);

  delete state.presets[role][name];

  if (isPlaying) state.config.layers[role].source = layerSources.deleted;

  commit();
  storePresets(role);
}

/**
 * @param {LayerRole} role
 * @param {string} name
 * @param {() => void} onPlaced
 * @returns {HTMLElement}
 */
export function buildPresetItem(role, name, onPlaced) {
  const { bands } = state.presets[role][name];
  const place = () => {
    replaceLayer(role, { name, source: layerSources.saved, bands });
    onPlaced();
  };

  return buildListRow({
    name,
    detail: describeBandCount(bands),
    isPlaying: () => isPresetInLayer(role, name),
    onPick: place,
    onRemove: () => deletePreset(role, name),
  });
}

/**
 * @param {Record<string, any>} stored
 * @returns {Promise<void>}
 */
export async function readPresets(stored) {
  for (const role of layerOrder) {
    const storedPresets = stored[storageKeys.presets[role]] || {};

    for (const [name, preset] of Object.entries(storedPresets)) state.presets[role][name] = { bands: cleanBands(preset && preset.bands) };
  }

  const [savedSoundsKey, presetsKey] = storageKeys.olderSounds;
  const olderSounds = stored[savedSoundsKey] || stored[presetsKey];

  if (!olderSounds) return;

  // An older sound becomes a headphone preset, and an ear preset when it has ear bands. A preset of that name wins.
  for (const [name, sound] of Object.entries(olderSounds)) {
    const layers = sanitizeConfig(sound).layers;

    state.presets.headphone[name] ??= { bands: layers.headphone.bands };

    const hasEarBands = Boolean(layers.ear) && layers.ear.bands.length > 0;

    if (hasEarBands) state.presets.ear[name] ??= { bands: layers.ear.bands };
  }

  // The old key goes only once the new lists are written, so a failed write loses nothing.
  await chrome.storage.local.set({ [storageKeys.presets.headphone]: state.presets.headphone, [storageKeys.presets.ear]: state.presets.ear });
  await chrome.storage.local.remove(storageKeys.olderSounds);
}

onRefresh(renderPresetCards);

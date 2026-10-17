// Sets: the picker on Listen and the Sets tab of the Library. A Set names one preset per layer, with the sliders.
import { emptyLayerNames, hasTooManyBands, layerLabels, layerOrder, layerSources, maxPlayedBandCount, newFlatHeadphone } from "../shared/config.js";
import { storageKeys } from "../shared/storage.js";
import { formatDb } from "../graph/format.js";
import { byId, buildElement, buildListRow, openLibrarySection, partOf, renderChildren, renderPlayingRows, renderSaveLabel, showHint, wireSaveRow } from "./dom.js";
import { buildListGroup } from "./items.js";
import { isPresetInLayer, isSavedPreset } from "./presets.js";
import { onPresetsChange, onRefresh, refresh } from "./refresh.js";
import { commit, dropBandChoice, setLayer } from "./sound.js";
import { state } from "./state.js";

/** @typedef {import("../shared/bands.js").Band} Band */

/** @typedef {import("../shared/config.js").Layer} Layer */

/** @typedef {import("../shared/config.js").LayerRole} LayerRole */

/** @typedef {import("../shared/config.js").SoundSet} SoundSet */

// What applying a Set did. Bridge.swift reads these words as they are.
const setAnswers = { applied: "applied", unknown: "unknown", tooManyBands: "tooManyBands", refused: "refused" };

// A layer that is off or has no bands plays nothing, so a Set holds it as an empty slot.
/**
 * @param {Layer | undefined} layer
 * @returns {boolean}
 */
function isLayerSilent(layer) {
  return !layer || !layer.on || layer.bands.length === 0;
}

// A Set can name a preset that was deleted, so the lookup may find nothing.
/**
 * @param {LayerRole} role
 * @param {string | null} presetName
 * @returns {{ bands: Band[] } | undefined}
 */
function findPreset(role, presetName) {
  const presets = state.presets[role];
  return presetName !== null && Object.hasOwn(presets, presetName) ? presets[presetName] : undefined;
}

/** @returns {string[]} */
function listSetNames() {
  return Object.keys(state.sets).sort((first, second) => first.localeCompare(second));
}

/**
 * @param {SoundSet} set
 * @returns {string}
 */
function describeSet(set) {
  return layerOrder.map((role) => {
    const presetName = set[role];

    if (presetName === null) return emptyLayerNames[role];

    return findPreset(role, presetName) ? presetName : `${presetName}, missing`;
  }).join(" · ");
}

// A slot plays when its layer holds that preset on and unedited. An empty or missing slot plays when its layer is silent.
function isSlotPlaying(role, presetName) {
  const layer = state.config.layers[role];

  if (!findPreset(role, presetName)) return isLayerSilent(layer);

  return isPresetInLayer(role, presetName) && layer.on && !layer.isEdited;
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isSetPlaying(name) {
  const set = state.sets[name];
  const { sliders } = state.config;
  const areLayersPlaying = layerOrder.every((role) => isSlotPlaying(role, set[role]));
  const areSlidersPlaying = Object.keys(sliders).every((key) => set.sliders[key] === sliders[key]);

  return areLayersPlaying && areSlidersPlaying;
}

/** @returns {string} */
function findPlayingSetName() {
  return listSetNames().find(isSetPlaying) ?? "";
}

// A missing preset plays as an empty slot. An empty ear or taste slot turns its layer off and keeps its bands.
function placeSlot(role, presetName) {
  const preset = findPreset(role, presetName);
  const layer = state.config.layers[role];

  if (preset) setLayer(role, { name: presetName, source: layerSources.saved, bands: preset.bands });
  else if (role === "headphone") state.config.layers.headphone = newFlatHeadphone();
  else if (layer) state.config.layers[role] = { ...layer, on: false };
}

// The Set goes into a copy of the config, so a Set with more bands than goui plays keeps the sound as it was.
function placeSet(name) {
  const set = state.sets[name];
  const before = state.config;

  state.config = { ...before, layers: { ...before.layers }, sliders: { ...set.sliders } };

  for (const role of layerOrder) placeSlot(role, set[role]);

  if (!hasTooManyBands(state.config)) return true;

  state.config = before;
  showHint("sets", `${name} has more bands than goui plays at once (up to ${maxPlayedBandCount} with the three sliders). Save the Set with fewer bands.`, true);

  return false;
}

// The layers and the sliders change before one commit, so the engine gets one sound and the graph draws once.
/**
 * @param {string} name
 * @returns {Promise<string>}
 */
async function applySet(name) {
  if (!placeSet(name)) {
    refresh();
    return setAnswers.tooManyBands;
  }

  dropBandChoice();

  return (await commit()) ? setAnswers.applied : setAnswers.refused;
}

// A name from the Mac menu or from goui set may not be a Set, so the app hears what happened.
async function applyNamedSet(name) {
  if (!hasSet(name)) return setAnswers.unknown;

  return applySet(name);
}

// A Set the engine cannot play keeps the sound, and the Sets tab shows why.
async function pickSet(name) {
  if (await applySet(name) === setAnswers.tooManyBands) openLibrarySection("sets");
}

/** @returns {SoundSet} */
function readCurrentSet() {
  const set = { headphone: null, ear: null, taste: null, sliders: { ...state.config.sliders } };

  for (const role of layerOrder) if (!isLayerSilent(state.config.layers[role])) set[role] = state.config.layers[role].name;

  return set;
}

// A Set names its presets, so each layer with bands must be a saved preset with no edits.
/** @returns {LayerRole[]} */
function listUnsavedRoles() {
  return layerOrder.filter((role) => {
    const layer = state.config.layers[role];
    const isSavedAsIs = isSavedPreset(role) && !layer.isEdited;

    return !isLayerSilent(layer) && !isSavedAsIs;
  });
}

/** @returns {boolean} */
function isReadyToSave() {
  return listUnsavedRoles().length === 0;
}

/** @param {boolean} isOpen */
function setSaveRowOpen(isOpen) {
  partOf("sets", "save-row").hidden = !isOpen;
  partOf("sets", "save-set").classList.toggle("is-on", isOpen);
}

// The alert names each layer that still has unsaved bands, and the save row closes.
/** @returns {void} */
function showUnsavedAlert() {
  const names = listUnsavedRoles().map((role) => layerLabels[role]).join(" and ");

  setSaveRowOpen(false);
  showHint("sets", `Save ${names} as a preset first. Each layer with bands needs a saved preset.`, true);
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function hasSet(name) {
  return Object.hasOwn(state.sets, name);
}

function openSaveRow() {
  if (!isReadyToSave()) {
    showUnsavedAlert();
    return;
  }

  const name = partOf("sets", "save-name");

  setSaveRowOpen(true);
  showHint("sets", "");
  name.value = "";
  renderSaveRow();
  name.focus();
}

function toggleSaveRow() {
  if (partOf("sets", "save-row").hidden) openSaveRow();
  else setSaveRowOpen(false);
}

// Save as Set on Listen opens the Sets tab, where the name goes and the alert shows.
function openSaveFromListen() {
  openLibrarySection("sets");
  openSaveRow();
}

function storeSets() {
  chrome.storage.local.set({ [storageKeys.sets]: state.sets });
  renderSets();
}

function saveSet(name) {
  if (!isReadyToSave()) {
    showUnsavedAlert();
    return;
  }

  const isUpdate = hasSet(name);

  state.sets[name] = readCurrentSet();
  setSaveRowOpen(false);
  storeSets();
  showHint("sets", `${isUpdate ? "Updated" : "Saved"} ${name}.`);
}

function deleteSet(name) {
  delete state.sets[name];
  storeSets();
}

// The note under the name says what the Set will name, and follows the sound while the row is open.
function renderSaveRow() {
  const { sliders } = state.config;
  const sliderWords = `Bass ${formatDb(sliders.bassDb)}, Vocals ${formatDb(sliders.vocalsDb)} and Treble ${formatDb(sliders.trebleDb)} dB`;

  renderSaveLabel("sets", hasSet);
  partOf("sets", "set-note").textContent = `Names ${describeSet(readCurrentSet())}, with ${sliderWords}.`;
}

// The picker is drawn again only when a name or the playing Set changes, so an open picker stays open.
function renderSetPicker(playing) {
  const names = listSetNames();
  const select = byId("setSelect");
  const buildOptions = () => {
    const options = names.map((name) => new Option(name, name));

    if (!playing) options.unshift(buildElement("option", { value: "", text: "No Set plays now", disabled: true }));

    return options;
  };

  renderChildren(select, JSON.stringify([names, playing]), buildOptions);
  select.value = playing;
}

function renderSetCard(playing) {
  const hasSets = Object.keys(state.sets).length > 0;
  let name = playing;

  if (!playing) name = hasSets ? "Pick a Set below" : "No Sets yet";

  partOf("sets", "current").title = playing ? "The Set that plays" : "No Set plays now";
  partOf("sets", "current-name").textContent = name;
}

function renderSetList() {
  const list = partOf("sets", "results");
  const names = listSetNames();
  const details = names.map((name) => describeSet(state.sets[name]));
  const buildRows = () => {
    const rows = names.map((name, index) => buildListRow({
      name,
      detail: details[index],
      isPlaying: () => isSetPlaying(name),
      onPick: () => applySet(name),
      onRemove: () => deleteSet(name),
    }));

    if (rows.length === 0) rows.push(buildElement("p", { className: "ui-text-hint", text: "Nothing saved yet. Save a Set from the layers and sliders." }));

    return buildListGroup("Sets", rows);
  };

  renderChildren(list, JSON.stringify([names, details]), buildRows);
  renderPlayingRows(list);
}

function renderSets() {
  const playing = findPlayingSetName();

  renderSetPicker(playing);
  renderSetCard(playing);
  renderSetList();
  renderSaveRow();
}

/** @returns {void} */
export function wireSets() {
  byId("setSelect").addEventListener("change", (event) => pickSet(event.target.value));
  byId("saveSet").addEventListener("click", openSaveFromListen);
  partOf("sets", "save-set").addEventListener("click", toggleSaveRow);
  wireSaveRow("sets", { hasName: hasSet, save: saveSet, emptyHint: "Give the Set a name first.", onInput: renderSaveRow });
}

// The Mac app plays a Set from its menu and from goui set through the page, which owns the sound math. Bridge.swift checks the version, so a renamed member fails loudly.
/** @returns {void} */
export function setMacSets() {
  /** @type {{ version: number, applySet: (name: string) => Promise<string>, listSetNames: () => string[], readPlayingSetName: () => string }} */
  globalThis.gouiSets = { version: 1, applySet: applyNamedSet, listSetNames, readPlayingSetName: findPlayingSetName };
}

onRefresh(renderSets);

for (const role of layerOrder) onPresetsChange(role, renderSets);

// Sets: the picker on Listen and the Sets tab of the Library. A Set names one preset per layer, with the sliders.
import { cleanBands } from "../shared/bands.js";
import { layerLabels, layerOrder, newLayer } from "../shared/config.js";
import { formatDb } from "../graph/format.js";
import { byId, buildElement, buildListRow, partOf, sectionOf, showTab } from "./dom.js";
import { appendSection } from "./items.js";
import { isSavedPreset } from "./presets.js";
import { onPresetsChange, onRefresh } from "./refresh.js";
import { commit, dropBandChoice } from "./sound.js";
import { layerSources, state } from "./state.js";

/** @typedef {import("../shared/bands.js").Band} Band */

/** @typedef {import("../shared/config.js").Layer} Layer */

/** @typedef {import("../shared/config.js").LayerRole} LayerRole */

/** @typedef {import("../shared/config.js").SoundSet} SoundSet */

const emptySlotNames = { headphone: "Flat", ear: "no ear", taste: "no taste" };

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

    if (presetName === null) return emptySlotNames[role];

    return findPreset(role, presetName) ? presetName : `${presetName}, missing`;
  }).join(" · ");
}

// A slot plays when its layer holds that preset unedited. An empty or missing slot plays when its layer is silent.
function isSlotPlaying(role, presetName) {
  const layer = state.config.layers[role];

  if (!findPreset(role, presetName)) return isLayerSilent(layer);

  return Boolean(layer) && layer.on && layer.source === layerSources.saved && layer.name === presetName && !layer.isEdited;
}

/** @returns {string} */
function findPlayingSetName() {
  const { sliders } = state.config;
  const isPlaying = (name) => {
    const set = state.sets[name];
    return layerOrder.every((role) => isSlotPlaying(role, set[role])) && Object.keys(sliders).every((key) => set.sliders[key] === sliders[key]);
  };

  return listSetNames().find(isPlaying) ?? "";
}

// A missing preset plays as an empty slot, so applying still works.
function placeSlot(role, presetName) {
  const preset = findPreset(role, presetName);

  if (preset) state.config.layers[role] = newLayer(presetName, layerSources.saved, cleanBands(preset.bands));
  else if (role === "headphone") state.config.layers.headphone = newLayer("Flat", layerSources.starter);
  else delete state.config.layers[role];
}

// The layers and the sliders change before one commit, so the engine gets one sound and the graph draws once.
/** @param {string} name */
function applySet(name) {
  const set = state.sets[name];

  for (const role of layerOrder) placeSlot(role, set[role]);

  state.config.sliders = { ...set.sliders };
  dropBandChoice();
  commit();
}

// A name from the Mac menu or from goui set may not be a Set, so the app hears whether it played.
function applyKnownSet(name) {
  if (!Object.hasOwn(state.sets, name)) return false;

  applySet(name);

  return true;
}

/** @returns {SoundSet} */
function readCurrentSet() {
  const set = { headphone: null, ear: null, taste: null, sliders: { ...state.config.sliders } };

  for (const role of layerOrder) if (!isLayerSilent(state.config.layers[role])) set[role] = state.config.layers[role].name;

  return set;
}

// A Set names its presets, so each layer with bands must be a saved preset with no edits.
function listUnsavedRoles() {
  return layerOrder.filter((role) => {
    const layer = state.config.layers[role];
    const isSavedAsIs = isSavedPreset(role) && !layer.isEdited;

    return !isLayerSilent(layer) && !isSavedAsIs;
  });
}

/**
 * @param {string} text
 * @param {boolean} [isAlert]
 */
function showSetHint(text, isAlert = false) {
  const hint = partOf("sets", "action-hint");

  hint.textContent = text;
  hint.classList.toggle("tone-danger", isAlert);
}

/** @param {boolean} isOpen */
function setSaveRowOpen(isOpen) {
  partOf("sets", "save-row").hidden = !isOpen;
  partOf("sets", "save-set").classList.toggle("is-on", isOpen);
}

/** @returns {string} */
function readSetName() {
  return partOf("sets", "save-name").value.trim();
}

// The alert names each layer that still has unsaved bands, and the save stops there.
/** @returns {boolean} */
function isReadyToSave() {
  const unsaved = listUnsavedRoles();

  if (unsaved.length === 0) return true;

  const names = unsaved.map((role) => layerLabels[role]).join(" and ");

  setSaveRowOpen(false);
  showSetHint(`Save ${names} as a preset first. A Set names its presets, so each layer with bands needs one.`, true);

  return false;
}

function openSaveRow() {
  if (!isReadyToSave()) return;

  const name = partOf("sets", "save-name");

  setSaveRowOpen(true);
  showSetHint("");
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
  showTab("tab", "library");
  showTab("role", "sets");
  sectionOf("sets").scrollIntoView({ block: "start" });
  openSaveRow();
}

function storeSets() {
  chrome.storage.local.set({ sets: state.sets });
  renderSets();
}

function confirmSaveSet() {
  const name = readSetName();

  if (!name) {
    showSetHint("Give the Set a name first.", true);
    return;
  }

  if (!isReadyToSave()) return;

  const isUpdate = Object.hasOwn(state.sets, name);

  state.sets[name] = readCurrentSet();
  setSaveRowOpen(false);
  storeSets();
  showSetHint(`${isUpdate ? "Updated" : "Saved"} ${name}.`);
}

function deleteSet(name) {
  delete state.sets[name];
  storeSets();
}

// The note under the name says what the Set will name, and follows the sound while the row is open.
function renderSaveRow() {
  const { sliders } = state.config;
  const sliderWords = `Bass ${formatDb(sliders.bassDb)}, Vocals ${formatDb(sliders.vocalsDb)} and Treble ${formatDb(sliders.trebleDb)} dB`;

  partOf("sets", "confirm-save").textContent = Object.hasOwn(state.sets, readSetName()) ? "Replace" : "Save";
  partOf("sets", "set-note").textContent = `It names ${describeSet(readCurrentSet())}, with ${sliderWords}.`;
}

function renderSetPicker(playing) {
  const select = byId("setSelect");
  const options = listSetNames().map((name) => new Option(name, name));

  if (!playing) options.unshift(buildElement("option", { value: "", text: "No Set plays now", disabled: true }));

  select.replaceChildren(...options);
  select.value = playing;
}

function renderSetCard(playing) {
  const hasSets = Object.keys(state.sets).length > 0;
  let name = playing;

  if (!playing) name = hasSets ? "Pick a Set below" : "Save your first Set";

  partOf("sets", "current-caption").textContent = playing ? "The Set that plays" : "No Set plays now";
  partOf("sets", "current-name").textContent = name;
}

function renderSetList(playing) {
  const list = partOf("sets", "results");
  const rows = listSetNames().map((name) => {
    const row = buildListRow({ name, detail: describeSet(state.sets[name]), onPick: () => applySet(name), onRemove: () => deleteSet(name) });

    row.classList.toggle("is-selected", name === playing);

    return row;
  });

  if (rows.length === 0) rows.push(buildElement("p", { className: "ui-text-hint", text: "Nothing saved yet. Set up the three layers, then press Save as Set." }));

  list.replaceChildren();
  appendSection(list, "Your Sets", rows);
}

function renderSets() {
  const playing = findPlayingSetName();

  renderSetPicker(playing);
  renderSetCard(playing);
  renderSetList(playing);
  renderSaveRow();
}

/** @returns {void} */
export function wireSets() {
  byId("setSelect").addEventListener("change", (event) => applySet(event.target.value));
  byId("saveSet").addEventListener("click", openSaveFromListen);
  partOf("sets", "save-set").addEventListener("click", toggleSaveRow);
  partOf("sets", "confirm-save").addEventListener("click", confirmSaveSet);
  partOf("sets", "save-name").addEventListener("input", renderSaveRow);
  partOf("sets", "save-name").addEventListener("keydown", (event) => {
    if (event.key === "Enter") confirmSaveSet();
  });
}

// The Mac app applies a Set from its menu through the page, which owns the sound math. Called once the stored Sets are read.
/** @returns {void} */
export function wireMacSets() {
  /** @type {{ applySet: (name: string) => boolean, readPlayingSetName: () => string }} */
  globalThis.gouiSets = { applySet: applyKnownSet, readPlayingSetName: findPlayingSetName };
}

onRefresh(renderSets);

for (const role of layerOrder) onPresetsChange(role, renderSets);

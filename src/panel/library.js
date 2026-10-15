// The Library tabs and actions: save, import, paste, export and the EQByEar test, and the ear and taste lists.
import { autoPreampDb } from "../shared/bands.js";
import { layerLabels, layerOrder } from "../shared/config.js";
import { parseAutoEq, toAutoEq } from "../autoeq.js";
import { byId, debounce, buildElement, partOf, resetBoxHeight, sectionOf, showAllLines, showHint } from "./dom.js";
import { renderHeadphoneList } from "./headphones.js";
import { appendSection, describeBandCount, buildResultItem } from "./items.js";
import { isSavedPreset, buildPresetItem, renderPresetCards, storePresets } from "./presets.js";
import { onPresetsChange } from "./refresh.js";
import { commit, readBands, removeLayer, replaceLayer } from "./sound.js";
import { layerSources, state } from "./state.js";

/** @typedef {import("../shared/config.js").LayerRole} LayerRole */

const pastedNames = { headphone: "Pasted headphone", ear: "Pasted ear tuning", taste: "Pasted taste" };
// The words of the ear and taste lists, which end with a row that takes the layer off.
const listWords = {
  ear: { heading: "Your ear presets", empty: "Nothing saved yet. Run the test, paste the result, then press Save.", off: "No ear tuning", offCaption: "Headphone only" },
  taste: { heading: "Your taste presets", empty: "Nothing saved yet. Add bands in Tune, or paste AutoEQ text, then press Save.", off: "No taste", offCaption: "Headphone and ear only" },
};
const typingPauseMs = 150;

/**
 * @param {LayerRole} role
 * @param {string} name
 */
function savePreset(role, name) {
  const layer = state.config.layers[role];
  const isUpdate = Boolean(state.presets[role][name]);

  state.presets[role][name] = { bands: structuredClone(layer.bands) };
  layer.name = name;
  layer.source = layerSources.saved;
  layer.isEdited = false;

  closeLibraryAction(role);
  commit();
  storePresets(role);
  showHint(role, `${isUpdate ? "Updated" : "Saved"} ${name}.`);
}

/** @param {"ear" | "taste"} role */
function renderLayerList(role) {
  const words = listWords[role];
  const list = partOf(role, "results");
  const items = Object.keys(state.presets[role]).map((name) => buildPresetItem(role, name, () => {}));

  if (items.length === 0) items.push(buildElement("p", { className: "hint", text: words.empty }));

  const turnOff = buildResultItem(words.off, words.offCaption, () => removeLayer(role));

  list.replaceChildren();
  appendSection(list, words.heading, items);
  list.append(turnOff);
  renderPresetCards();
}

/** @returns {void} */
export function renderLayerLists() {
  renderLayerList("ear");
  renderLayerList("taste");
}

// The Library shows one layer's section at a time, under a tab for each layer.
/** @param {LayerRole} role */
export function showLibrarySection(role) {
  state.libraryRole = role;

  for (const each of layerOrder) sectionOf(each).hidden = each !== role;
  for (const button of byId("libraryTabs").children) button.classList.toggle("on", button.dataset.role === role);

  chrome.storage.local.set({ libraryRole: role });
}

/**
 * @param {LayerRole} role
 * @param {string} text
 * @param {string} name
 * @param {string} source
 */
function applyAutoEqText(role, text, name, source) {
  const parsed = parseAutoEq(text);

  if (parsed.bands.length === 0) {
    showHint(role, "No AutoEQ filters found in that text.");
    return;
  }

  replaceLayer({ name, source, bands: parsed.bands, preampDb: parsed.preampDb }, role);
  showHint(role, `Applied ${describeBandCount(parsed.bands)} to ${layerLabels[role]}. Press Save to keep it.`);
}

/**
 * @param {LayerRole} role
 * @returns {string}
 */
function readSaveName(role) {
  return partOf(role, "save-name").value.trim();
}

/** @param {LayerRole} role */
function renderConfirmSaveLabel(role) {
  partOf(role, "confirm-save").textContent = state.presets[role][readSaveName(role)] ? "Replace" : "Save";
}

/**
 * @param {LayerRole} role
 * @param {string} action
 */
function fillSaveName(role, action) {
  // Save fills in the current name, so an AutoEQ pick saves under its headphone name.
  partOf(role, "save-name").value = action === "save" ? state.config.layers[role].name : "";
  renderConfirmSaveLabel(role);
  partOf(role, "save-name").focus();
}

function fillExportText(role) {
  const bands = readBands(state.config.layers[role]);

  showAllLines(partOf(role, "text"), toAutoEq({ preampDb: autoPreampDb(bands), bands }));
  showHint(role, `${layerLabels[role]} alone, as AutoEQ text. Copy it out.`);
}

function emptyPasteBox(role) {
  const text = partOf(role, "text");

  text.value = "";
  resetBoxHeight(text);
  text.focus();
}

const fillActionRow = { save: fillSaveName, saveAs: fillSaveName, export: fillExportText, paste: emptyPasteBox };

// Each section button opens its own row. A second press on the same button closes it.
/**
 * @param {LayerRole} role
 * @param {string} action
 */
export function toggleLibraryAction(role, action) {
  const openAction = state.openActions[role] === action ? "" : action;

  state.openActions[role] = openAction;
  partOf(role, "save-row").hidden = openAction !== "save" && openAction !== "saveAs";
  partOf(role, "drawer").hidden = openAction !== "paste" && openAction !== "export";
  partOf(role, "apply").hidden = openAction !== "paste";

  for (const button of partOf(role, "library-actions").children) button.classList.toggle("on", button.dataset.action === openAction);

  showHint(role, "");

  if (openAction) fillActionRow[openAction](role, openAction);
}

function closeLibraryAction(role) {
  if (state.openActions[role]) toggleLibraryAction(role, state.openActions[role]);
}

const libraryActions = {
  save: (role) => {
    if (isSavedPreset(role)) savePreset(role, state.config.layers[role].name);
    else toggleLibraryAction(role, "save");
  },
  saveAs: (role) => toggleLibraryAction(role, "saveAs"),
  confirmSave: (role) => {
    const name = readSaveName(role);

    if (name) savePreset(role, name);
    else showHint(role, "Give the preset a name first.");
  },
  import: (role) => partOf(role, "import-file").click(),
  paste: (role) => toggleLibraryAction(role, "paste"),
  export: (role) => toggleLibraryAction(role, "export"),
  apply: (role) => applyAutoEqText(role, partOf(role, "text").value, pastedNames[role], layerSources.pasted),
  // The test measures what you hear, so My ear comes off first. The headphone layer stays on.
  measure: () => {
    if (state.config.layers.ear) state.config.layers.ear.on = false;

    commit();
    chrome.tabs.create({ url: "https://eqbyear.com" });
  },
};

async function importFile(role, file) {
  const dot = file.name.lastIndexOf(".");
  const name = dot > 0 ? file.name.slice(0, dot) : file.name;

  applyAutoEqText(role, await file.text(), name, layerSources.file);
}

/** @returns {void} */
export function wireLibrary() {
  byId("libraryTabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-role]");

    if (button) showLibrarySection(button.dataset.role);
  });

  for (const role of layerOrder) {
    sectionOf(role).addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");

      if (button) libraryActions[button.dataset.action](role);
    });
    partOf(role, "save-name").addEventListener("input", () => renderConfirmSaveLabel(role));
    partOf(role, "save-name").addEventListener("keydown", (event) => {
      if (event.key === "Enter") libraryActions.confirmSave(role);
    });
    partOf(role, "import-file").addEventListener("change", (event) => {
      const [file] = event.target.files;

      event.target.value = "";

      if (file) importFile(role, file);
    });
  }

  partOf("headphone", "search").addEventListener("input", debounce(renderHeadphoneList, typingPauseMs));
}

onPresetsChange("ear", () => renderLayerList("ear"));
onPresetsChange("taste", () => renderLayerList("taste"));

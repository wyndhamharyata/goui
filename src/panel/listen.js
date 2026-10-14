// The Listen tab: the layer rows, the sliders, the preamp and Level match.
import { maxBoostDb } from "../shared/bands.js";
import { layerLabels, layerOrder, listExportBands, makePlayedSound, preampRangeDb, sliderRangeDb } from "../shared/config.js";
import { findFamily, makeAutoEqItem, toAutoEq } from "../autoeq.js";
import { layerColor } from "../graph/colors.js";
import { formatDb } from "../graph/format.js";
import { byId, makeElement, sectionOf, setField, showTab } from "./dom.js";
import { describeLayerName } from "./items.js";
import { changeTarget } from "./headphones.js";
import { toggleLibraryAction } from "./library.js";
import { onRefresh } from "./refresh.js";
import { commit, removeEarLayer } from "./sound.js";
import { state } from "./state.js";

/** @typedef {import("../shared/config.js").Layer} Layer */

/** @typedef {import("../shared/config.js").LayerRole} LayerRole */

/** @typedef {import("../shared/config.js").AutoEqOrigin} AutoEqOrigin */

/** @param {LayerRole} role */
function openLibrarySection(role) {
  showTab("library");
  sectionOf(role).scrollIntoView({ block: "start" });
}

// The targets a headphone from AutoEQ can take. A family with one target shows its name only.
/**
 * @param {AutoEqOrigin} autoEq
 * @returns {HTMLElement}
 */
function makeTargetChoice(autoEq) {
  const family = findFamily(state.targetData.families, makeAutoEqItem(autoEq.name, autoEq.path));
  const choice = makeElement("label", { className: "target", text: "Target", title: "The sound AutoEQ tunes your headphone toward" });
  if (!family || family.labels.length < 2) {
    choice.append(makeElement("span", { text: autoEq.target }));
    return choice;
  }
  const select = makeElement("select");
  for (const label of family.labels) select.append(new Option(label, label));
  select.value = autoEq.target;
  select.addEventListener("change", () => changeTarget(select.value));
  choice.append(select);

  return choice;
}

/**
 * @param {LayerRole} role
 * @param {Layer} layer
 * @returns {HTMLElement}
 */
function makeLayerRow(role, layer) {
  const toggle = makeElement("label", { className: "switch", title: `Turn the ${layerLabels[role]} layer on or off` });
  const box = makeElement("input");
  box.type = "checkbox";
  box.checked = layer.on;
  box.addEventListener("change", () => {
    layer.on = box.checked;
    commit();
  });
  toggle.append(box, makeElement("span", { className: "track" }));

  const caption = makeElement("small", { className: "caption" });
  const mark = makeElement("i", { className: "layer-mark" });
  mark.style.borderColor = layerColor[role];
  caption.append(mark, `${layerLabels[role]} · ${layer.source}`);
  const text = makeElement("div", { className: "grow" });
  text.append(caption, makeElement("b", { text: describeLayerName(layer) }));
  if (layer.autoEq) text.append(makeTargetChoice(layer.autoEq));

  const change = makeElement("button", { text: "Change" });
  change.addEventListener("click", () => openLibrarySection(role));

  const row = makeElement("div", { className: layer.on ? "layer" : "layer off" });
  row.append(toggle, text, change);
  if (role === "ear") {
    const remove = makeElement("button", { text: "×", title: "Take the ear layer off" });
    remove.addEventListener("click", removeEarLayer);
    row.append(remove);
  }

  return row;
}

/** @returns {HTMLElement} */
function makeAddEarButton() {
  const add = makeElement("button", {
    text: "Add your ear tuning on top",
    title: "Open My ear in the Library, to paste an eqbyear result or pick a saved ear preset",
  });
  add.addEventListener("click", () => {
    openLibrarySection("ear");
    if (state.openActions.ear !== "paste") toggleLibraryAction("ear", "paste");
  });

  return add;
}

// The stack on Listen. One row per layer, each with its own switch, its source and its name.
function renderLayers() {
  const host = byId("layers");
  host.replaceChildren();
  for (const role of layerOrder) {
    const layer = state.config.layers[role];
    if (layer) host.append(makeLayerRow(role, layer));
  }
  if (!state.config.layers.ear) host.append(makeAddEarButton());
}

function renderSound() {
  const played = makePlayedSound(state.config);
  byId("enabled").checked = state.config.enabled;

  for (const sliderName of ["bass", "vocals", "treble"]) {
    setField(sliderName, state.config.sliders[`${sliderName}Db`]);
    byId(`${sliderName}Value`).textContent = `${formatDb(state.config.sliders[`${sliderName}Db`])} dB`;
  }

  setField("preamp", played.preampDb.toFixed(1));
  byId("preampValue").textContent = `${formatDb(played.preampDb)} dB`;
  byId("autoPreamp").classList.toggle("on", state.config.autoPreamp);
  byId("preampNote").textContent = state.config.autoPreamp ? "Auto" : "Manual";

  // A rounding margin, so a boost that auto preamp offsets exactly never shows red.
  const clipMarginDb = 0.05;
  const headroomDb = maxBoostDb(played.bands) + played.preampDb;
  const isClipping = state.config.enabled && headroomDb > clipMarginDb;
  byId("clip").classList.toggle("red", isClipping);
  byId("meter").title = isClipping
    ? `The EQ can clip by ${headroomDb.toFixed(1)} dB. Turn the preamp down or press Auto.`
    : "Output level. No clipping.";
}

// Turning Auto off keeps the value Auto had, so the sound does not jump.
function toggleAutoPreamp() {
  if (state.config.autoPreamp) state.config.preampDb = makePlayedSound(state.config).preampDb;
  state.config.autoPreamp = !state.config.autoPreamp;
  commit();
}

/** @param {HTMLInputElement} slider */
function readSlider(slider) {
  const valueDb = Number(slider.value);
  if (slider.id === "preamp") {
    state.config.autoPreamp = false;
    state.config.preampDb = valueDb;
  } else {
    state.config.sliders[`${slider.id}Db`] = valueDb;
  }
  commit();
}

// The slider limits come from the same numbers that clean a stored config.
/** @returns {void} */
export function setSliderRanges() {
  const ranges = { bass: sliderRangeDb, vocals: sliderRangeDb, treble: sliderRangeDb, preamp: preampRangeDb };
  for (const [id, [minDb, maxDb]] of Object.entries(ranges)) Object.assign(byId(id), { min: minDb, max: maxDb });
}

/** @returns {void} */
export function wireListen() {
  byId("sliders").addEventListener("input", (event) => {
    if (event.target.type === "range") readSlider(event.target);
  });
  byId("levelMatch").addEventListener("change", (event) => {
    state.isLevelMatched = event.target.checked;
    chrome.storage.local.set({ isLevelMatched: state.isLevelMatched });
  });
  byId("autoPreamp").addEventListener("click", toggleAutoPreamp);
  byId("exportAll").addEventListener("click", () => {
    const whole = byId("wholeText");
    whole.hidden = false;
    whole.value = toAutoEq({ preampDb: makePlayedSound(state.config).preampDb, bands: listExportBands(state.config) });
  });
}

onRefresh(renderLayers);
onRefresh(renderSound);

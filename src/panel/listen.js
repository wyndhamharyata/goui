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
  const choice = { className: "target", text: "Target", title: "The sound AutoEQ tunes your headphone toward" };
  if (!family || family.labels.length < 2) return makeElement("label", choice, [makeElement("span", { text: autoEq.target })]);

  const options = family.labels.map((label) => new Option(label, label));
  const select = makeElement("select", { on: { change: (event) => changeTarget(event.target.value) } }, options);
  select.value = autoEq.target;

  return makeElement("label", choice, [select]);
}

/**
 * @param {LayerRole} role
 * @param {Layer} layer
 * @returns {HTMLElement}
 */
function makeLayerRow(role, layer) {
  /** @param {Event} event */
  const switchLayer = (event) => {
    layer.on = event.target.checked;
    commit();
  };
  const toggle = makeElement("label", { className: "switch", title: `Turn the ${layerLabels[role]} layer on or off` }, [
    makeElement("input", { type: "checkbox", checked: layer.on, on: { change: switchLayer } }),
    makeElement("span", { className: "track" }),
  ]);

  const mark = makeElement("i", { className: "layer-mark", style: { borderColor: layerColor[role] } });
  const caption = makeElement("small", { className: "caption" }, [mark, `${layerLabels[role]} · ${layer.source}`]);
  const texts = [caption, makeElement("b", { text: describeLayerName(layer) })];
  if (layer.autoEq) texts.push(makeTargetChoice(layer.autoEq));

  const parts = [toggle, makeElement("div", { className: "grow" }, texts)];
  parts.push(makeElement("button", { text: "Change", on: { click: () => openLibrarySection(role) } }));
  if (role === "ear") parts.push(makeElement("button", { text: "×", title: "Take the ear layer off", on: { click: removeEarLayer } }));

  return makeElement("div", { className: layer.on ? "layer" : "layer off" }, parts);
}

/** @returns {HTMLElement} */
function makeAddEarButton() {
  const openEarPaste = () => {
    openLibrarySection("ear");
    if (state.openActions.ear !== "paste") toggleLibraryAction("ear", "paste");
  };

  return makeElement("button", {
    text: "Add your ear tuning on top",
    title: "Open My ear in the Library, to paste an eqbyear result or pick a saved ear preset",
    on: { click: openEarPaste },
  });
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

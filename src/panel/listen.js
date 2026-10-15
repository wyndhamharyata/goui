// The Listen tab: the layer rows, the sliders, the preamp and Level match.
import { maxBoostDb } from "../shared/bands.js";
import { layerLabels, layerOrder, listExportBands, toPlayedSound, preampRangeDb, sliderRangeDb } from "../shared/config.js";
import { findTargetSet, newAutoEqItem, toAutoEq } from "../autoeq.js";
import { layerColor } from "../graph/colors.js";
import { formatDb } from "../graph/format.js";
import { linearPosition } from "../shared/math.js";
import { byId, buildElement, sectionOf, setField, showAllLines, showTab } from "./dom.js";
import { describeLayerName } from "./items.js";
import { changeTarget, clearHeadphoneLayer } from "./headphones.js";
import { showLibrarySection, toggleLibraryAction } from "./library.js";
import { onRefresh } from "./refresh.js";
import { commit, removeLayer } from "./sound.js";
import { state } from "./state.js";

/** @typedef {import("../shared/config.js").Layer} Layer */

/** @typedef {import("../shared/config.js").LayerRole} LayerRole */

/** @typedef {import("../shared/config.js").AutoEqOrigin} AutoEqOrigin */

/** @param {LayerRole} role */
function openLibrarySection(role) {
  showTab("library");
  showLibrarySection(role);
  sectionOf(role).scrollIntoView({ block: "start" });
}

// The targets a headphone from AutoEQ can take. A target set of one shows its name only.
function buildTargetChoice(autoEq) {
  const targetSet = findTargetSet(state.targetData.targetSets, newAutoEqItem(autoEq.name, autoEq.path));
  const choice = { className: "target", text: "Target", title: "The sound AutoEQ tunes your headphone toward" };

  if (!targetSet || targetSet.labels.length < 2) return buildElement("label", choice, [buildElement("span", { text: autoEq.target })]);

  const options = targetSet.labels.map((label) => new Option(label, label));
  const select = buildElement("select", { on: { change: (event) => changeTarget(event.target.value) } }, options);

  select.value = autoEq.target;

  return buildElement("label", choice, [select]);
}

function buildLayerRow(role, layer) {
  const switchLayer = (event) => {
    layer.on = event.target.checked;
    commit();
  };
  const toggle = buildElement("label", { className: "switch", title: `Turn the ${layerLabels[role]} layer on or off` }, [
    buildElement("input", { type: "checkbox", checked: layer.on, on: { change: switchLayer } }),
    buildElement("span", { className: "track" }),
  ]);

  const mark = buildElement("i", { className: "layer-mark", style: { borderColor: layerColor[role] } });
  const caption = buildElement("small", { className: "caption" }, [mark, `${layerLabels[role]} · ${layer.source}`]);
  const texts = [caption, buildElement("b", { text: describeLayerName(layer) })];

  if (layer.autoEq) texts.push(buildTargetChoice(layer.autoEq));

  const parts = [toggle, buildElement("div", { className: "grow" }, texts)];

  parts.push(buildElement("button", { text: "Change", on: { click: () => openLibrarySection(role) } }));

  if (role !== "headphone") parts.push(buildElement("button", { text: "×", title: `Take the ${role} layer off`, on: { click: () => removeLayer(role) } }));
  if (role === "headphone" && layer.bands.length > 0) parts.push(buildElement("button", { text: "×", title: "Clear the headphone layer to Flat", on: { click: clearHeadphoneLayer } }));

  return buildElement("div", { className: layer.on ? "layer" : "layer off" }, parts);
}

// The add buttons of the layers on top. Two share one row under short names, so a headphone alone keeps the stack short.
const addLayerWords = {
  ear: {
    short: "Add ear tuning",
    long: "Add your ear tuning on top",
    title: "Open My ear in the Library, to paste an EQByEar result or pick a saved ear preset",
  },
  taste: {
    short: "Add taste",
    long: "Add your taste on top",
    title: "Open Taste in the Library, to pick a saved taste preset or paste AutoEQ text. You can also add Taste bands in Tune.",
  },
};

function openAddedLayer(role) {
  openLibrarySection(role);

  if (role === "ear" && state.openActions.ear !== "paste") toggleLibraryAction("ear", "paste");
}

function buildAddLayerButtons(missingRoles) {
  const isShort = missingRoles.length > 1;
  const buttons = missingRoles.map((role) => buildElement("button", {
    text: isShort ? addLayerWords[role].short : addLayerWords[role].long,
    title: addLayerWords[role].title,
    on: { click: () => openAddedLayer(role) },
  }));

  return buildElement("div", { className: "add-layers" }, buttons);
}

// The stack on Listen. One row per layer, each with its own switch, its source and its name.
function renderLayers() {
  const host = byId("layers");

  host.replaceChildren();

  for (const role of layerOrder) {
    const layer = state.config.layers[role];

    if (layer) host.append(buildLayerRow(role, layer));
  }

  const missingRoles = ["ear", "taste"].filter((role) => !state.config.layers[role]);

  if (missingRoles.length > 0) host.append(buildAddLayerButtons(missingRoles));
}

function renderSound() {
  const played = toPlayedSound(state.config);

  byId("enabled").checked = state.config.enabled;

  for (const sliderName of ["bass", "vocals", "treble"]) {
    setField(sliderName, state.config.sliders[`${sliderName}Db`]);
    renderSliderFill(sliderName, state.config.sliders[`${sliderName}Db`]);
    byId(`${sliderName}Value`).textContent = `${formatDb(state.config.sliders[`${sliderName}Db`])} dB`;
  }

  setField("preamp", played.preampDb.toFixed(1));
  renderSliderFill("preamp", played.preampDb);
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

// WebKit has no CSS for the part of a range left of its handle, so the page gives it as --fill.
/**
 * @param {string} id
 * @param {number} valueDb
 */
function renderSliderFill(id, valueDb) {
  const slider = byId(id);
  const share = linearPosition(valueDb, Number(slider.min), Number(slider.max));

  slider.style.setProperty("--fill", `${(share * 100).toFixed(2)}%`);
}

// Turning Auto off keeps the value Auto had, so the sound does not jump.
function toggleAutoPreamp() {
  if (state.config.autoPreamp) state.config.preampDb = toPlayedSound(state.config).preampDb;

  state.config.autoPreamp = !state.config.autoPreamp;
  commit();
}

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
  // A second press puts the text away, as each layer's Export does.
  byId("exportAll").addEventListener("click", () => {
    const whole = byId("wholeText");

    whole.hidden = !whole.hidden;
    showAllLines(whole, toAutoEq({ preampDb: toPlayedSound(state.config).preampDb, bands: listExportBands(state.config) }));
    byId("exportAll").classList.toggle("on", !whole.hidden);
  });
}

onRefresh(renderLayers);
onRefresh(renderSound);

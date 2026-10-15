// The Listen tab: the layer rows, the sliders, the preamp and Level match.
import { layerLabels, layerOrder, listExportBands, toPlayedSound, preampRangeDb, sliderRangeDb } from "../shared/config.js";
import { findTargetSet, newAutoEqItem, toAutoEq } from "../autoeq.js";
import { layerTone } from "../graph/colors.js";
import { formatDb } from "../graph/format.js";
import { linearPosition } from "../shared/math.js";
import { storageKeys } from "../shared/storage.js";
import { byId, buildButton, buildElement, buildIcon, buildStackRow, openLibrarySection, renderChildren, setField, showAllLines } from "./dom.js";
import { describeLayerName } from "./items.js";
import { changeTarget, clearHeadphoneLayer } from "./headphones.js";
import { toggleLibraryAction } from "./library.js";
import { onRefresh } from "./refresh.js";
import { commit, removeLayer } from "./sound.js";
import { state } from "./state.js";

/** @typedef {import("../shared/config.js").Layer} Layer */

/** @typedef {import("../shared/config.js").LayerRole} LayerRole */

/** @typedef {import("../shared/config.js").AutoEqOrigin} AutoEqOrigin */

// The targets a headphone from AutoEQ can take. A target set of one shows its name only.
function buildTargetChoice(autoEq) {
  const targetSet = findTargetSet(state.targetData.targetSets, newAutoEqItem(autoEq.name, autoEq.path));
  const choice = { className: "pn-target target", title: "The sound AutoEQ tunes your headphone toward" };

  if (!targetSet || targetSet.labels.length < 2) return buildElement("span", choice, [buildElement("span", { className: "pn-target-name", text: `Target · ${autoEq.target}` })]);

  const options = targetSet.labels.map((label) => new Option(label, label));
  const select = buildElement("select", { className: "ui-field__control", on: { change: (event) => changeTarget(event.target.value) } }, options);
  const field = buildElement("span", { className: "ui-field ui-field--select" }, [buildElement("span", { className: "ui-field__prefix", text: "Target" }), select, buildIcon("chevron")]);

  select.value = autoEq.target;

  return buildElement("label", choice, [field]);
}

// The row can outlive its layer object, so the switch looks the layer up when it is pressed.
function buildLayerRow(role, layer) {
  const switchLayer = (event) => {
    state.config.layers[role].on = event.target.checked;
    commit();
  };
  const toggle = buildElement("label", { className: "ui-switch switch", title: `Turn the ${layerLabels[role]} layer on or off` }, [
    buildElement("input", { type: "checkbox", checked: layer.on, on: { change: switchLayer } }),
    buildElement("span", { className: "ui-switch__knob" }),
  ]);

  const change = buildButton({ variant: "quiet", isSmall: true, label: "Change", title: `Open ${layerLabels[role]} in the Library`, onClick: () => openLibrarySection(role) });
  const trail = [change];

  if (role !== "headphone") trail.push(buildButton({ variant: "quiet", isSmall: true, icon: "close", title: `Take the ${role} layer off`, onClick: () => removeLayer(role) }));
  if (role === "headphone" && layer.bands.length > 0) trail.push(buildButton({ variant: "quiet", isSmall: true, icon: "close", title: "Clear the headphone layer to Flat", onClick: clearHeadphoneLayer }));

  const extra = layer.autoEq ? [buildTargetChoice(layer.autoEq)] : [];

  return buildStackRow({
    tone: layerTone[role],
    lead: toggle,
    caption: `${layerLabels[role]} · ${layer.source}`,
    name: describeLayerName(layer),
    extra,
    trail,
    isOff: !layer.on,
    hook: "layer",
  });
}

// A layer you have not added keeps its place in the chain, as an empty row with its add button.
const addLayerWords = {
  ear: {
    label: "Add your ear tuning",
    title: "Open My ear in the Library, to paste an EQByEar result or pick a saved ear preset",
  },
  taste: {
    label: "Add your taste",
    title: "Open Taste in the Library, to pick a saved taste preset or paste AutoEQ text. You can also add Taste bands in Tune.",
  },
};

function openAddedLayer(role) {
  openLibrarySection(role);

  if (role === "ear" && state.openActions.ear !== "paste") toggleLibraryAction("ear", "paste");
}

function buildEmptyLayerRow(role) {
  const words = addLayerWords[role];
  const add = buildButton({ isSmall: true, icon: "plus", label: words.label, title: words.title, onClick: () => openAddedLayer(role) });

  return buildStackRow({ tone: layerTone[role], caption: layerLabels[role], name: "Not added", trail: [add], isEmpty: true });
}

// What a layer row shows. The rows are built again only when one of these changes.
function readRowFacts(layer) {
  if (!layer) return [];

  return [layer.on, layer.source, layer.name, layer.isEdited, layer.bands.length > 0, layer.autoEq];
}

// The stack on Listen. One row per layer, each with its own switch, its source and its name.
function renderLayers() {
  const layers = state.config.layers;
  const buildRows = () => layerOrder.map((role) => (layers[role] ? buildLayerRow(role, layers[role]) : buildEmptyLayerRow(role)));
  const onCount = layerOrder.filter((role) => layers[role] && layers[role].on).length;

  renderChildren(byId("layers"), JSON.stringify(layerOrder.map((role) => readRowFacts(layers[role]))), buildRows);
  byId("layerCount").textContent = `${onCount} of 3 on`;
}

function renderHeader() {
  byId("enabled").checked = state.config.enabled;
  byId("compare").classList.toggle("is-held", state.isComparing);
  byId("hearingCaption").textContent = state.isComparing ? "Holding A/B, the EQ is off" : "Hearing";
}

function renderSliders() {
  for (const sliderName of ["bass", "vocals", "treble"]) {
    const valueDb = state.config.sliders[`${sliderName}Db`];

    setField(sliderName, valueDb);
    renderSliderFill(sliderName, valueDb);
    byId(`${sliderName}Value`).textContent = `${formatDb(valueDb)} dB`;
  }
}

function renderPreamp() {
  const { preampDb } = toPlayedSound(state.config);

  setField("preamp", preampDb.toFixed(1));
  renderSliderFill("preamp", preampDb);
  byId("preampValue").textContent = `${formatDb(preampDb)} dB`;
  byId("autoPreamp").classList.toggle("is-on", state.config.autoPreamp);
  byId("preampNote").textContent = state.config.autoPreamp ? "Auto" : "Manual";
}

// A dB slider fills from 0 dB to its value, so a cut and a boost read apart at a glance.
/**
 * @param {string} id
 * @param {number} valueDb
 */
function renderSliderFill(id, valueDb) {
  const slider = byId(id);
  const [zeroShare, valueShare] = [0, valueDb].map((levelDb) => linearPosition(levelDb, Number(slider.min), Number(slider.max)) * 100);

  slider.style.setProperty("--low", `${Math.min(zeroShare, valueShare).toFixed(2)}%`);
  slider.style.setProperty("--high", `${Math.max(zeroShare, valueShare).toFixed(2)}%`);
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
    chrome.storage.local.set({ [storageKeys.isLevelMatched]: state.isLevelMatched });
  });
  byId("autoPreamp").addEventListener("click", toggleAutoPreamp);
  // A second press puts the text away, as each layer's Export does.
  byId("exportAll").addEventListener("click", () => {
    const whole = byId("wholeText");

    whole.hidden = !whole.hidden;
    showAllLines(whole, toAutoEq({ preampDb: toPlayedSound(state.config).preampDb, bands: listExportBands(state.config) }));
    byId("exportAll").classList.toggle("is-on", !whole.hidden);
  });
}

onRefresh(renderLayers);
onRefresh(renderHeader);
onRefresh(renderSliders);
onRefresh(renderPreamp);

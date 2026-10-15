// The Tune tab: the band chips, the inspector of the chosen band and the number table.
import { bandTypeDetails, hasGain, hasQ, newBandFrequencyHz, qStepRatio, setBandFrequency, setBandGain, setBandQ } from "../shared/bands.js";
import { layerLabels, layerOrder } from "../shared/config.js";
import { qToOctaves, semitonesToRatio } from "../shared/math.js";
import { layerColor, typeColor } from "../graph/colors.js";
import { formatDb, formatHz } from "../graph/format.js";
import { byId, buildElement, setField } from "./dom.js";
import { onRefresh } from "./refresh.js";
import { addBandToLayer, commit, commitBandEdit, deleteSelectedBand, listBandEntries, readSelectedIndex, readSelectedRole, selectBand } from "./sound.js";
import { state } from "./state.js";

/** @typedef {import("../shared/bands.js").Band} Band */

const gainStepDb = 0.5;

function buildChip(entry, index) {
  const classNames = ["chip"];

  if (entry.band === state.selectedBand) classNames.push("on");
  if (!entry.band.on) classNames.push("muted");

  const number = buildElement("i", { text: index + 1, style: { background: typeColor[entry.band.type] } });

  return buildElement("button", { className: classNames.join(" "), dataset: { index } }, [number, formatHz(entry.band.frequencyHz)]);
}

// One row per layer, each with its own label and its own Add band chip.
function renderChips() {
  const entries = listBandEntries();
  const rows = layerOrder.map((role) => {
    const chips = entries.flatMap((entry, index) => (entry.role === role ? [buildChip(entry, index)] : []));
    const add = buildElement("button", { className: "chip add", text: "Add band", title: `Make a new band in ${layerLabels[role]}`, dataset: { add: role } });
    const label = buildElement("span", { className: "chip-label", text: layerLabels[role], style: { color: layerColor[role] } });

    return buildElement("div", { className: "chip-row" }, [label, buildElement("div", { className: "chip-track" }, [...chips, add])]);
  });

  byId("chips").replaceChildren(...rows);
}

function describeQ(band) {
  if (band.type === "PK") return `Q, ${qToOctaves(band.q).toFixed(1)} octaves wide`;
  if (bandTypeDetails[band.type].node.endsWith("shelf")) return "Q, not used by a shelf";

  return "Q";
}

// A value the band type does not use stays on show, with its field and its steps turned off.
/**
 * @param {string} step
 * @param {string} inputId
 * @param {boolean} isUsed
 */
function renderStepper(step, inputId, isUsed) {
  byId(inputId).disabled = !isUsed;

  for (const button of document.querySelectorAll(`[data-step="${step}"]`)) button.disabled = !isUsed;
}

/** @returns {void} */
export function renderInspector() {
  const index = readSelectedIndex();
  const band = state.selectedBand;
  const isChosen = index >= 0;

  byId("inspectorEmpty").hidden = isChosen;
  byId("inspectorBody").hidden = !isChosen;

  if (!isChosen) return;

  const title = byId("bandTitle");

  title.textContent = `${layerLabels[readSelectedRole()]} · ${index + 1}. ${bandTypeDetails[band.type].label}`;
  Object.assign(title.style, { color: typeColor[band.type] });
  setField("bandType", band.type);

  // The segment buttons hold the common types. The others are under More.
  const isCommon = Boolean(byId("bandSegments").querySelector(`[data-type="${band.type}"]`));

  byId("bandType").hidden = isCommon && !state.isMoreOpen;
  byId("moreTypes").classList.toggle("on", !byId("bandType").hidden);

  for (const button of byId("bandSegments").querySelectorAll("[data-type]")) {
    button.classList.toggle("on", button.dataset.type === band.type);
  }

  byId("bandOn").textContent = band.on ? "On" : "Off";
  byId("bandOn").classList.toggle("on", band.on);
  byId("bandSolo").classList.toggle("on", state.soloBand === band);

  setField("frequencyInput", Math.round(band.frequencyHz));
  setField("gainInput", formatDb(band.gainDb));
  setField("qInput", band.q.toFixed(2));
  renderStepper("gain", "gainInput", hasGain(band.type));
  renderStepper("q", "qInput", hasQ(band.type));
  byId("qHint").textContent = describeQ(band);
}

function buildTableRow({ band }, index) {
  const number = buildElement("span", { className: "number", text: index + 1, style: { color: typeColor[band.type] } });
  const gain = hasGain(band.type) ? formatDb(band.gainDb) : "";
  const values = [Math.round(band.frequencyHz), gain, band.q.toFixed(2)];
  const cells = [buildElement("td", {}, [number, bandTypeDetails[band.type].label]), ...values.map((value) => buildElement("td", { text: value }))];

  return buildElement("tr", { className: band === state.selectedBand ? "on" : "", dataset: { index } }, cells);
}

function renderTable() {
  const head = buildElement("tr", {}, ["Band", "Hz", "dB", "Q"].map((label) => buildElement("th", { text: label })));

  byId("table").replaceChildren(head, ...listBandEntries().map(buildTableRow));
}

const bandSteps = {
  frequency: (band, direction) => setBandFrequency(band, band.frequencyHz * semitonesToRatio(direction)),
  gain: (band, direction) => setBandGain(band, band.gainDb + (direction * gainStepDb)),
  q: (band, direction) => setBandQ(band, band.q * (qStepRatio ** direction)),
};

const bandFieldSetters = {
  frequencyInput: setBandFrequency,
  gainInput: setBandGain,
  qInput: setBandQ,
};

/** @returns {void} */
export function wireTune() {
  byId("chips").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-index], [data-add]");

    if (!chip) return;
    if (chip.dataset.add) {
      addBandToLayer(chip.dataset.add, newBandFrequencyHz, 0);
      return;
    }

    // A second press on the chosen chip unselects it.
    const index = Number(chip.dataset.index);

    selectBand(index === readSelectedIndex() ? -1 : index);
  });
  byId("table").addEventListener("click", (event) => {
    const row = event.target.closest("[data-index]");

    if (row) selectBand(Number(row.dataset.index));
  });
  byId("inspector").addEventListener("click", (event) => {
    const button = event.target.closest("[data-step]");

    if (!button) return;

    bandSteps[button.dataset.step](state.selectedBand, Number(button.dataset.direction));
    commitBandEdit();
  });
  byId("inspector").addEventListener("input", (event) => {
    const setBandField = bandFieldSetters[event.target.id];

    if (!setBandField) return;

    setBandField(state.selectedBand, Number(event.target.value.replace(",", ".")));
    commitBandEdit();
  });
  byId("bandSegments").addEventListener("click", (event) => {
    const button = event.target.closest("button");

    if (!button) return;
    if (button.id === "moreTypes") {
      state.isMoreOpen = !state.isMoreOpen;
      renderInspector();
      return;
    }

    state.selectedBand.type = button.dataset.type;
    commitBandEdit();
  });
  byId("bandType").addEventListener("change", (event) => {
    state.selectedBand.type = event.target.value;
    commitBandEdit();
  });
  byId("bandOn").addEventListener("click", () => {
    state.selectedBand.on = !state.selectedBand.on;
    commitBandEdit();
  });
  byId("bandSolo").addEventListener("click", () => {
    state.soloBand = state.soloBand === state.selectedBand ? null : state.selectedBand;
    commit();
  });
  byId("bandDelete").addEventListener("click", deleteSelectedBand);
}

onRefresh(renderChips);
onRefresh(renderInspector);
onRefresh(renderTable);

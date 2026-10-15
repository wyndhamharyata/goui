// The Tune tab: the band chips, the inspector of the chosen band and the number table.
import { bandTypeDetails, hasGain, hasQ, newBandFrequencyHz, qStepRatio, setBandFrequency, setBandGain, setBandQ } from "../shared/bands.js";
import { layerLabels, layerOrder } from "../shared/config.js";
import { qToOctaves, semitonesToRatio } from "../shared/math.js";
import { layerTone, typeTone } from "../graph/colors.js";
import { formatDb, formatHz } from "../graph/format.js";
import { byId, buildElement, buildIcon, buildSectionHeader, markCurrent, renderChildren, setField } from "./dom.js";
import { onRefresh } from "./refresh.js";
import { addBandToLayer, commit, commitBandEdit, deleteSelectedBand, listBandEntries, readSelectedIndex, readSelectedRole, selectBand } from "./sound.js";
import { state } from "./state.js";

/** @typedef {import("../shared/bands.js").Band} Band */

const gainStepDb = 0.5;

function buildChip(entry, index) {
  const classNames = ["ui-chip", "ui-chip--band", typeTone[entry.band.type]];

  if (entry.band === state.selectedBand) classNames.push("is-on");
  if (!entry.band.on) classNames.push("is-muted");

  const number = buildElement("i", { className: "ui-chip__mark", text: index + 1 });
  const title = `${bandTypeDetails[entry.band.type].label} at ${Math.round(entry.band.frequencyHz)} Hz`;

  return buildElement("button", { type: "button", className: classNames.join(" "), title, dataset: { index } }, [number, buildElement("span", { text: formatHz(entry.band.frequencyHz) })]);
}

// What the chips and the table show of each band. They are built again only when one of these changes.
/**
 * @param {import("../graph/graph.js").BandEntry[]} entries
 * @returns {string}
 */
function readBandsKey(entries) {
  return JSON.stringify(entries.map(({ role, band }) => [role, band.type, band.frequencyHz, band.gainDb, band.q, band.on, band === state.selectedBand]));
}

// One row per layer, each with its own label and its own Add band chip.
function renderChips() {
  const entries = listBandEntries();
  const buildRows = () => layerOrder.map((role) => {
    const chips = entries.flatMap((entry, index) => (entry.role === role ? [buildChip(entry, index)] : []));
    const add = buildElement("button", { type: "button", className: "ui-chip ui-chip--add", title: `Add a band to ${layerLabels[role]}`, dataset: { add: role } }, [
      buildIcon("plus"),
      buildElement("span", { text: "Add band" }),
    ]);
    const head = buildSectionHeader({ label: layerLabels[role], count: chips.length, tone: layerTone[role] });

    return buildElement("div", { className: "pn-chip-row" }, [head, buildElement("div", { className: "ui-cluster" }, [...chips, add])]);
  });

  renderChildren(byId("chips"), readBandsKey(entries), buildRows);
}

function describeQ(band) {
  if (band.type === "PK") return `Q, ${qToOctaves(band.q).toFixed(1)} oct`;

  return "Q";
}

// The line under the fields says why a field is missing for this type.
const missingFieldNotes = {
  shelf: "Web Audio shelves have no Q. goui keeps the Q from an AutoEQ file but does not play it.",
  cut: "A cut has no gain. Q is not edited here.",
  pass: "This type has no gain.",
};

function readMissingFieldNote(type) {
  if (hasGain(type) && !hasQ(type)) return missingFieldNotes.shelf;
  if (!hasGain(type) && !hasQ(type)) return missingFieldNotes.cut;
  if (!hasGain(type)) return missingFieldNotes.pass;

  return "";
}

// A value the band type does not use is not shown. Its field and its steps also turn off.
/**
 * @param {string} step
 * @param {string} inputId
 * @param {boolean} isUsed
 */
function renderStepper(step, inputId, isUsed) {
  byId(inputId).disabled = !isUsed;
  byId(inputId).closest(".ui-field--stepper").hidden = !isUsed;

  for (const button of document.querySelectorAll(`[data-step="${step}"]`)) button.disabled = !isUsed;
}

// The common types have a cell each. More is the sixth cell, and it opens a select of the rare types.
function renderTypeChoice(band) {
  const isCommon = Boolean(byId("bandSegments").querySelector(`[data-type="${band.type}"]`));
  const isMoreShown = !isCommon || state.isMoreOpen;
  const more = byId("moreTypes");

  markCurrent(byId("bandSegments"), "type", isMoreShown ? "" : band.type);
  more.classList.toggle("is-current", isMoreShown);
  more.setAttribute("aria-checked", String(isMoreShown));
  byId("bandTypeField").hidden = !isMoreShown;
  setField("bandType", isCommon ? "" : band.type);
}

/** @returns {void} */
export function renderInspector() {
  const index = readSelectedIndex();
  const band = state.selectedBand;
  const isChosen = index >= 0;

  byId("inspectorEmpty").hidden = isChosen;
  byId("inspectorBody").hidden = !isChosen;

  if (!isChosen) return;

  byId("bandHead").className = `ui-section-header ui-section-header--section ${typeTone[band.type]}`;
  byId("bandTitle").textContent = `${layerLabels[readSelectedRole()]} · ${index + 1}. ${bandTypeDetails[band.type].label}`;
  renderTypeChoice(band);

  byId("bandOn").textContent = band.on ? "On" : "Off";
  byId("bandOn").classList.toggle("is-on", band.on);
  byId("bandSolo").classList.toggle("is-on", state.soloBand === band);

  setField("frequencyInput", Math.round(band.frequencyHz));
  setField("gainInput", formatDb(band.gainDb));
  setField("qInput", band.q.toFixed(2));
  renderStepper("gain", "gainInput", hasGain(band.type));
  renderStepper("q", "qInput", hasQ(band.type));
  byId("qHint").textContent = describeQ(band);
  byId("bandFields").style.setProperty("--columns", String(1 + Number(hasGain(band.type)) + Number(hasQ(band.type))));
  byId("bandNote").textContent = readMissingFieldNote(band.type);
}

function buildTableRow({ band }, index) {
  const number = buildElement("span", { className: `ui-badge ui-badge--step ${typeTone[band.type]}`, text: index + 1 });
  const gain = hasGain(band.type) ? formatDb(band.gainDb) : "";
  const values = [Math.round(band.frequencyHz), gain, band.q.toFixed(2)];
  const cells = [buildElement("td", {}, [number, bandTypeDetails[band.type].label]), ...values.map((value) => buildElement("td", { text: value }))];
  const classNames = [];

  if (band === state.selectedBand) classNames.push("is-selected");
  if (!band.on) classNames.push("is-muted");

  return buildElement("tr", { className: classNames.join(" "), dataset: { index } }, cells);
}

function renderTable() {
  const entries = listBandEntries();
  const head = buildElement("tr", {}, ["Band", "Hz", "dB", "Q"].map((label) => buildElement("th", { text: label })));

  renderChildren(byId("table"), readBandsKey(entries), () => [head, ...entries.map(buildTableRow)]);
  byId("tableCount").textContent = String(entries.length);
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

    state.isMoreOpen = false;
    state.selectedBand.type = button.dataset.type;
    commitBandEdit();
  });
  byId("bandType").addEventListener("change", (event) => {
    state.isMoreOpen = false;
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

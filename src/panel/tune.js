// The Tune tab: the band chips, the inspector of the chosen band and the number table.
import { bandTypeDetails, hasGain, newBandFrequencyHz, qStepRatio, setBandFrequency, setBandGain, setBandQ } from "../shared/bands.js";
import { layerLabels, layerOrder } from "../shared/config.js";
import { qToOctaves, semitonesToRatio } from "../shared/math.js";
import { layerColor, typeColor } from "../graph/colors.js";
import { formatDb, formatHz } from "../graph/format.js";
import { byId, makeElement, setField } from "./dom.js";
import { onRefresh } from "./refresh.js";
import { addBandToLayer, commit, commitBandEdit, deleteSelectedBand, listBandEntries, readSelectedIndex, readSelectedRole, selectBand } from "./sound.js";
import { state } from "./state.js";

/** @typedef {import("../shared/bands.js").Band} Band */

const gainStepDb = 0.5;

// One row per layer, each with its own label and its own Add band chip.
function renderChips() {
  const host = byId("chips");
  host.replaceChildren();
  const entries = listBandEntries();
  for (const role of layerOrder) {
    const track = makeElement("div", { className: "chip-track" });
    entries.forEach((entry, index) => {
      if (entry.role !== role) return;
      const chip = makeElement("button", { className: "chip" });
      chip.classList.toggle("on", entry.band === state.selectedBand);
      chip.classList.toggle("muted", !entry.band.on);
      chip.dataset.index = index;
      const number = makeElement("i", { text: index + 1 });
      number.style.background = typeColor[entry.band.type];
      chip.append(number, formatHz(entry.band.frequencyHz));
      track.append(chip);
    });

    const add = makeElement("button", { className: "chip add", text: "Add band", title: `Make a new band in ${layerLabels[role]}` });
    add.dataset.add = role;
    track.append(add);
    const label = makeElement("span", { className: "chip-label", text: layerLabels[role] });
    label.style.color = layerColor[role];
    const row = makeElement("div", { className: "chip-row" });
    row.append(label, track);
    host.append(row);
  }
}

/**
 * @param {Band} band
 * @returns {string}
 */
function describeQ(band) {
  if (band.type === "PK") return `Q, ${qToOctaves(band.q).toFixed(1)} octaves wide`;
  if (bandTypeDetails[band.type].node.endsWith("shelf")) return "Q, not used by a shelf yet";
  return "Q";
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
  title.style.color = typeColor[band.type];
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
  byId("gainInput").disabled = !hasGain(band.type);
  byId("qHint").textContent = describeQ(band);
}

function renderTable() {
  const head = makeElement("tr");
  for (const label of ["Band", "Hz", "dB", "Q"]) head.append(makeElement("th", { text: label }));
  const rows = listBandEntries().map(({ band }, index) => {
    const row = makeElement("tr");
    row.dataset.index = index;
    row.classList.toggle("on", band === state.selectedBand);
    const number = makeElement("span", { className: "number", text: index + 1 });
    number.style.color = typeColor[band.type];
    const typeCell = makeElement("td");
    typeCell.append(number, bandTypeDetails[band.type].label);
    row.append(typeCell);

    const gain = hasGain(band.type) ? formatDb(band.gainDb) : "";
    for (const value of [Math.round(band.frequencyHz), gain, band.q.toFixed(2)]) row.append(makeElement("td", { text: value }));
    return row;
  });
  byId("table").replaceChildren(head, ...rows);
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

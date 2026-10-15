// The headphone section of the Library: your presets, the starter sounds and the AutoEQ search.
import { butterworthQ } from "../shared/bands.js";
import { describeMeasurement, fetchHeadphone, findTargetSet, loadAutoEqIndex, newAutoEqItem } from "../autoeq.js";
import { buildElement, buildListRow, partOf, showTab } from "./dom.js";
import { appendSection, describeBandCount } from "./items.js";
import { buildPresetItem, renderPresetCards } from "./presets.js";
import { onPresetsChange } from "./refresh.js";
import { replaceLayer } from "./sound.js";
import { layerSources, state } from "./state.js";

/** @typedef {import("../autoeq.js").AutoEqItem} AutoEqItem */

const starterPresets = [
  { name: "Flat", bands: [] },
  {
    name: "Warm",
    bands: [
      { on: true, type: "LSC", frequencyHz: 120, gainDb: 3, q: butterworthQ },
      { on: true, type: "HSC", frequencyHz: 8000, gainDb: -2, q: butterworthQ },
    ],
  },
  { name: "Clear vocals", bands: [{ on: true, type: "PK", frequencyHz: 2500, gainDb: 3, q: 1 }] },
  {
    name: "Night listening",
    bands: [
      { on: true, type: "LSC", frequencyHz: 100, gainDb: -3, q: butterworthQ },
      { on: true, type: "HSC", frequencyHz: 6000, gainDb: -3, q: butterworthQ },
    ],
  },
];

const maxResultCount = 20;
const minQueryLength = 2;

/**
 * @param {AutoEqItem} item
 * @param {HTMLElement} hint
 * @param {string} [target]
 * @returns {Promise<boolean>}
 */
async function loadHeadphone(item, hint, target) {
  hint.textContent = `Loading ${item.name}...`;

  const headphone = await fetchHeadphone(item, state.targetData, target);

  if (!headphone) {
    hint.textContent = `${item.name} did not load. Check the network and try again.`;
    return false;
  }

  replaceLayer({ ...headphone, name: item.name, source: layerSources.autoEq }, "headphone");
  hint.textContent = "";

  return true;
}

// A change of target loads the headphone again with the new target. Edits to its bands are lost.
/** @param {string} target */
export function changeTarget(target) {
  const { name, path } = state.config.layers.headphone.autoEq;

  loadHeadphone(newAutoEqItem(name, path), partOf("headphone", "search-hint"), target);
}

// A pick from a typed search is the end of that search. The box empties and Listen shows the sound.
function endHeadphoneSearch() {
  const box = partOf("headphone", "search");

  if (box.value.trim() === "") return;

  box.value = "";
  renderHeadphoneList();
  showTab("tab", "listen");
}

function buildMeasurementItem(item, hint) {
  const detail = describeMeasurement(item, findTargetSet(state.targetData.targetSets, item));
  const pickMark = buildElement("span", { className: "ui-badge ui-badge--pill tone-good", text: "AutoEQ's pick", title: "AutoEQ recommends this measurement of the headphone" });
  const loadPicked = async () => {
    if (await loadHeadphone(item, hint)) endHeadphoneSearch();
  };

  return buildListRow({ name: item.name, detail, badge: item.isAutoEqPick ? pickMark : undefined, onPick: loadPicked });
}

async function findHeadphones(query, hint) {
  hint.textContent = "Searching AutoEQ...";

  const items = await loadAutoEqIndex().catch(() => null);

  hint.textContent = items ? "" : "The AutoEQ list did not load. Check the network.";

  return (items || []).filter((item) => item.name.toLowerCase().includes(query)).slice(0, maxResultCount);
}

/**
 * @param {HTMLElement} list
 * @param {{ saved: HTMLElement[], autoEq: HTMLElement[], starter: HTMLElement[] }} sections
 */
function showHeadphoneList(list, sections) {
  list.replaceChildren();
  appendSection(list, "Your headphone presets", sections.saved);
  appendSection(list, "AutoEQ headphones", sections.autoEq);
  appendSection(list, "Starter sounds", sections.starter);
  renderPresetCards();
}

// The headphone layer cannot come off, so its × plays it flat again, as picking Flat does.
/** @returns {void} */
export function clearHeadphoneLayer() {
  const [flat] = starterPresets;

  replaceLayer({ name: flat.name, source: layerSources.starter, bands: flat.bands }, "headphone");
}

// An empty box lists your headphone presets and the starter sounds. Typing also searches AutoEQ.
/**
 * @param {string} name
 * @param {string} query
 * @returns {boolean}
 */
function matchesQuery(name, query) {
  return name.toLowerCase().includes(query);
}

/** @returns {Promise<void>} */
export async function renderHeadphoneList() {
  const list = partOf("headphone", "results");
  const hint = partOf("headphone", "search-hint");
  const query = partOf("headphone", "search").value.trim().toLowerCase();

  // A slower search for an older query must not draw over the newer one.
  list.dataset.query = query;

  const saved = Object.keys(state.presets.headphone).filter((name) => matchesQuery(name, query)).map((name) => buildPresetItem("headphone", name, endHeadphoneSearch));

  if (saved.length === 0 && query === "") {
    saved.push(buildElement("p", { className: "ui-text-hint", text: "Nothing saved yet. Pick your headphone, then press Save." }));
  }

  const starter = starterPresets.filter((preset) => matchesQuery(preset.name, query)).map((preset) => {
    const place = () => {
      replaceLayer({ name: preset.name, source: layerSources.starter, bands: preset.bands }, "headphone");
      endHeadphoneSearch();
    };

    return buildListRow({ name: preset.name, detail: describeBandCount(preset.bands), onPick: place });
  });

  // Your presets and the starter sounds show at once. The AutoEQ list joins once it loads.
  showHeadphoneList(list, { saved, autoEq: [], starter });
  hint.textContent = "";

  if (query.length < minQueryLength) return;

  const headphones = await findHeadphones(query, hint);

  if (list.dataset.query !== query) return;

  showHeadphoneList(list, { saved, autoEq: headphones.map((item) => buildMeasurementItem(item, hint)), starter });

  if (list.children.length === 0) hint.textContent = "No sound by that name.";
}

onPresetsChange("headphone", renderHeadphoneList);

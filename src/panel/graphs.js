// The Listen graph and the Tune graph, and the zoom and tall buttons they share.
import { storageKeys } from "../shared/storage.js";
import { byId, markCurrent } from "./dom.js";
import { EqGraph } from "../graph/graph.js";
import { onRefresh } from "./refresh.js";
import { addBandToLayer, commitBandEdit, isEqOff, listBandEntries, listCurveBands, listCurveLayers, readSelectedIndex, readSelectedRole, selectBand } from "./sound.js";
import { state } from "./state.js";

// The graph changes the band objects in config itself while you drag, then calls commitBandEdit.
/** @type {import("../graph/graph.js").GraphHooks} */
const graphHooks = {
  listBandEntries,
  listCurveBands,
  listCurveLayers,
  readSpectrumDb: () => state.spectrumDb,
  readSelectedIndex,
  isEqOff,
  selectBand,
  commitBandEdit,
  // A new band joins the layer of the selected band. With none selected it joins the headphone layer.
  addBand: (frequencyHz, gainDb) => addBandToLayer(readSelectedRole() || "headphone", frequencyHz, gainDb),
};

// The Listen graph is a preview. It matches the Tune graph in size and follows its zoom and turn.
const graphHeights = { height: 210, tallHeight: 440 };
const listenGraph = new EqGraph(byId("listenGraph"), { ...graphHeights, interactive: false }, graphHooks);

export const tuneGraph = new EqGraph(byId("tuneGraph"), { ...graphHeights, interactive: true }, graphHooks);
export const graphs = [listenGraph, tuneGraph];

/** @returns {void} */
export function renderPills() {
  markCurrent(byId("zoom"), "zoom", tuneGraph.zoom);
  byId("tall").classList.toggle("is-on", tuneGraph.isTall);
}

/** @returns {void} */
export function wireGraphButtons() {
  byId("zoom").addEventListener("click", (event) => {
    const button = event.target.closest("[data-zoom]");

    if (button) for (const graph of graphs) graph.setZoom(button.dataset.zoom);

    renderPills();
  });
  byId("tall").addEventListener("click", () => {
    const isTall = !tuneGraph.isTall;

    for (const graph of graphs) graph.setTall(isTall);

    chrome.storage.local.set({ [storageKeys.view]: isTall ? "tall" : "wide" });
    renderPills();
  });
}

onRefresh(() => {
  for (const graph of graphs) graph.render();
});

// Each view registers its redraw here, so a change can redraw every view with no view importing another.

const renderers = [];
const presetListRenderers = { headphone: [], ear: [] };

/** @param {() => void} render */
export function onRefresh(render) {
  renderers.push(render);
}

/** @returns {void} */
export function refresh() {
  for (const render of renderers) render();
}

/**
 * @param {import("../shared/config.js").LayerRole} role
 * @param {() => void} render
 */
export function onPresetsChange(role, render) {
  presetListRenderers[role].push(render);
}

/** @param {import("../shared/config.js").LayerRole} role */
export function renderPresetList(role) {
  for (const render of presetListRenderers[role]) render();
}

// Small helpers for the panel's page.
/** @typedef {import("../shared/config.js").LayerRole} LayerRole */

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
export const byId = (id) => document.getElementById(id);

// The Library has one section per layer. Both sections use the same class names inside.
/**
 * @param {LayerRole} role
 * @returns {HTMLElement}
 */
export const sectionOf = (role) => document.querySelector(`.preset-section[data-role="${role}"]`);

/**
 * @param {LayerRole} role
 * @param {string} name
 * @returns {HTMLElement}
 */
export const partOf = (role, name) => sectionOf(role).querySelector(`.${name}`);

// The panel's one way to build an element, as buildSvg is the graph's. Other keys are element properties.
/**
 * @param {string} tag
 * @param {{ text?: string | number, style?: Partial<CSSStyleDeclaration>, dataset?: Record<string, string | number>, on?: Record<string, (event: Event) => void>, [property: string]: unknown }} [options]
 * @param {(Node | string)[]} [children]
 * @returns {HTMLElement}
 */
export function buildElement(tag, options = {}, children = []) {
  const { text = "", style = {}, dataset = {}, on = {}, ...properties } = options;
  const element = document.createElement(tag);

  Object.assign(element, properties);
  Object.assign(element.style, style);

  for (const [key, value] of Object.entries(dataset)) element.dataset[key] = String(value);

  for (const [type, listener] of Object.entries(on)) element.addEventListener(type, listener);

  if (text !== "") element.textContent = text;

  element.append(...children);

  return element;
}

/**
 * @param {() => void} run
 * @param {number} waitMs
 * @returns {() => void}
 */
export function debounce(run, waitMs) {
  let timer = 0;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(run, waitMs);
  };
}

/**
 * @param {LayerRole} role
 * @param {string} text
 */
export function showHint(role, text) {
  partOf(role, "action-hint").textContent = text;
}

// A field the person is typing in keeps their text.
/**
 * @param {string} id
 * @param {string | number} value
 */
export function setField(id, value) {
  const field = byId(id);

  if (field !== document.activeElement) field.value = value;
}

/** @param {string} name */
export function showTab(name) {
  byId("app").dataset.showing = name;

  for (const button of byId("tabs").children) button.classList.toggle("on", button.dataset.tab === name);

  chrome.storage.local.set({ tab: name });
}

// Everything goui reads from AutoEQ: the index, a headphone's file, the target curves and the text format.
import { bandTypes, butterworthQ, hasGain } from "./shared/bands.js";
import { fitTargetChange } from "./fit.js";

/** @typedef {import("./shared/bands.js").Band} Band */

/** @typedef {import("./shared/config.js").AutoEqOrigin} AutoEqOrigin */

/** @typedef {{ name: string, path: string, source: string, form: string, rig: string, isAutoEqPick: boolean }} AutoEqItem */

/** @typedef {{ labels: string[], measurements: { source: string, form: string, rig?: string }[] }} RigFamily */

/** @typedef {{ families: RigFamily[], targets: import("./fit.js").TargetCurve[] }} TargetData */

/** @typedef {{ bands: Band[], preampDb: number, autoEq?: AutoEqOrigin }} Headphone */

const autoEqBase = "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/";
/** @type {AutoEqItem[] | null} */
let autoEqItems = null;
/** @type {Promise<TargetData> | null} */
let targetData = null;

const forms = ["over-ear", "in-ear", "earbud"];
const formLabels = { "over-ear": "Over-ear", "in-ear": "In-ear", earbud: "Earbud" };

// A path reads "source/folder/name". The folder is the rig, if named, then the form: "GRAS 43AG-7 over-ear".
/**
 * @param {string} name
 * @param {string} path
 * @param {boolean} [isAutoEqPick]
 * @returns {AutoEqItem}
 */
export function makeAutoEqItem(name, path, isAutoEqPick = false) {
  const [source = "", folder = ""] = decodeURIComponent(path).split("/");
  const form = forms.find((each) => folder.endsWith(each)) || "";
  return { name, path, source, form, rig: folder.slice(0, folder.length - form.length).trim(), isAutoEqPick };
}

/** @returns {Promise<TargetData>} */
export function loadTargets() {
  targetData ??= fetch(chrome.runtime.getURL("src/targets.json")).then((response) => response.json());
  return targetData;
}

// A target only suits the rig it was made for. AutoEQ names the measurements each family suits.
/**
 * @param {RigFamily[]} families
 * @param {AutoEqItem} item
 * @returns {RigFamily | undefined}
 */
export function findFamily(families, item) {
  /**
   * @param {{ source: string, form: string, rig?: string }} each
   * @returns {boolean}
   */
  const suits = (each) => each.source === item.source && each.form === item.form && (!each.rig || each.rig === item.rig);

  return families.find((family) => family.measurements.some(suits));
}

// AutoEQ's own file tunes a headphone to the first target of its family.
/**
 * @param {RigFamily} family
 * @returns {string}
 */
function readAutoEqTarget(family) {
  return family.labels[0];
}

// The source, form, rig and target tell apart the measurements of one headphone name.
/**
 * @param {AutoEqItem} item
 * @param {RigFamily | undefined} family
 * @returns {string}
 */
export function describeMeasurement(item, family) {
  const parts = [item.source];
  if (item.form) parts.push(formLabels[item.form]);
  if (item.rig) parts.push(item.rig.replace("Bruel & Kjaer", "B&K"));
  if (family) parts.push(readAutoEqTarget(family));

  return parts.join(" · ");
}

/**
 * @param {string} text
 * @returns {AutoEqItem[]}
 */
function readIndex(text) {
  const items = [];
  const countByName = new Map();
  for (const line of text.split("\n")) {
    // A line reads "- [Name](./path) by source". A path can hold brackets, so it runs to the last ") by ".
    const nameStart = "- [".length;
    const nameEnd = line.indexOf("](./");
    const pathEnd = line.lastIndexOf(") by ");
    const isEntry = line.startsWith("- [") && nameEnd > 0 && pathEnd > nameEnd;
    if (!isEntry) continue;
    const name = line.slice(nameStart, nameEnd);
    items.push(makeAutoEqItem(name, line.slice(nameEnd + "](./".length, pathEnd), !countByName.has(name)));
    countByName.set(name, (countByName.get(name) || 0) + 1);
  }
  // The first measurement of a name is the one AutoEQ recommends. A name with one measurement has no pick.
  for (const item of items) item.isAutoEqPick &&= countByName.get(item.name) > 1;

  return items;
}

// The index is kept for a week, so a second search is fast.
/** @returns {Promise<AutoEqItem[]>} */
export async function loadAutoEqIndex() {
  if (autoEqItems) return autoEqItems;
  const cached = await chrome.storage.local.get(["autoEqIndex", "autoEqIndexAt"]);
  const indexLifetimeMs = 7 * 24 * 60 * 60 * 1000;
  const isFresh = cached.autoEqIndexAt && Date.now() - cached.autoEqIndexAt < indexLifetimeMs;
  let text = isFresh ? cached.autoEqIndex : null;
  if (!text) {
    text = await (await fetch(`${autoEqBase}INDEX.md`)).text();
    await chrome.storage.local.set({ autoEqIndex: text, autoEqIndexAt: Date.now() });
  }
  autoEqItems = readIndex(text);

  return autoEqItems;
}

// AutoEQ's file plays as it is. Another target plays fitted bands on top. A failed download gives null.
/**
 * @param {AutoEqItem} item
 * @param {TargetData} targets
 * @param {string} [target]
 * @returns {Promise<Headphone | null>}
 */
export async function fetchHeadphone(item, targets, target) {
  const file = encodeURIComponent(`${item.name} ParametricEQ.txt`);
  const response = await fetch(`${autoEqBase}${item.path}/${file}`).catch(() => null);
  if (!response || !response.ok) return null;
  const parsed = parseAutoEq(await response.text());
  const family = findFamily(targets.families, item);
  if (!family) return parsed;

  const autoEqTarget = readAutoEqTarget(family);
  const chosen = family.labels.includes(target) ? target : autoEqTarget;
  /**
   * @param {string} label
   * @returns {import("./fit.js").TargetCurve}
   */
  const curveOf = (label) => targets.targets.find((curve) => curve.label === label);
  const moveBands = chosen === autoEqTarget ? [] : fitTargetChange(curveOf(autoEqTarget), curveOf(chosen));

  return { bands: [...parsed.bands, ...moveBands], preampDb: parsed.preampDb, autoEq: { name: item.name, path: item.path, target: chosen } };
}

/** @typedef {{ preampDb: number, bands: Band[] }} AutoEqFile */

const typeAliases = { PEAK: "PK", PEAKING: "PK", LOWPASS: "LP", HIGHPASS: "HP", NOTCH: "NO" };

// An AutoEQ line reads "Filter 1: ON PK Fc 105 Hz Gain -3.1 dB Q 0.70", with Gain and Q optional.
/**
 * @param {string} text
 * @returns {AutoEqFile}
 */
export function parseAutoEq(text) {
  const bands = [];
  let preampDb = 0;
  for (const line of text.split("\n")) {
    const words = line.trim().split(" ").filter((word) => word !== "");
    const label = (words[0] || "").toLowerCase();
    if (label === "preamp:") {
      preampDb = Number(words[1]);
      continue;
    }
    if (label !== "filter") continue;

    /**
     * @param {string} name
     * @returns {number | undefined}
     */
    const readAfter = (name) => {
      const at = words.findIndex((word) => word.toLowerCase() === name);
      return at < 0 ? undefined : Number(words[at + 1]);
    };
    const typeWord = (words[3] || "").toUpperCase();
    const type = typeAliases[typeWord] || typeWord;
    const frequencyHz = readAfter("fc");
    const isBand = bandTypes.includes(type) && Number.isFinite(frequencyHz);
    if (!isBand) continue;

    bands.push({ on: words[2].toUpperCase() === "ON", type, frequencyHz, gainDb: readAfter("gain") ?? 0, q: readAfter("q") ?? butterworthQ });
  }

  return { bands, preampDb };
}

/**
 * @param {AutoEqFile} file
 * @returns {string}
 */
export function toAutoEq(file) {
  const lines = [`Preamp: ${file.preampDb.toFixed(1)} dB`];
  file.bands.forEach((band, index) => {
    const on = band.on ? "ON" : "OFF";
    const gain = hasGain(band.type) ? ` Gain ${band.gainDb.toFixed(1)} dB` : "";
    lines.push(`Filter ${index + 1}: ${on} ${band.type} Fc ${Math.round(band.frequencyHz)} Hz${gain} Q ${band.q.toFixed(2)}`);
  });

  return lines.join("\n");
}

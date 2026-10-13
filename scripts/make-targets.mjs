// Builds src/targets.json from AutoEQ. The AutoEQ web app lists its targets, the measurements each
// one suits and the bass boost it adds. A rig family then gains the other curves from the AutoEQ
// targets folder that were made for the same rig. Those files hold their own bass.
import { writeFileSync } from "node:fs";

const repo = "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master";
const pointCount = 121;

// The first label is the target AutoEQ used for the measurements in the family.
const families = [
  ["Harman over-ear 2018", "Harman over-ear 2015", "Harman over-ear 2013", "oratory1990 optimum hifi over-ear"],
  ["AutoEq in-ear", "Harman in-ear 2019", "Harman in-ear 2017-1", "Harman in-ear 2016", "oratory1990 in-ear"],
  ["JM-1 with Harman filters", "Diffuse Field 5128 (-1 dB/oct)"],
  ["HMS II.3 AutoEq in-ear", "HMS II.3 Harman in-ear 2019"],
  ["HMS II.3 Harman over-ear 2018"],
  ["crinacle EARS + 711 Harman over-ear 2018"],
  ["LMG 5128 0.6 without bass"],
];

/**
 * @param {number[]} frequenciesHz
 * @param {number[]} levelsDb
 * @returns {number[]}
 */
function resample(frequenciesHz, levelsDb) {
  const curve = [];
  for (let index = 0; index < pointCount; index += 1) {
    const frequencyHz = 20 * 1000 ** (index / (pointCount - 1));
    let upper = frequenciesHz.findIndex((each) => each >= frequencyHz);
    if (upper <= 0) upper = upper === 0 ? 1 : frequenciesHz.length - 1;
    const lower = upper - 1;
    const share = Math.log(frequencyHz / frequenciesHz[lower]) / Math.log(frequenciesHz[upper] / frequenciesHz[lower]);
    const levelDb = levelsDb[lower] + (Math.min(Math.max(share, 0), 1) * (levelsDb[upper] - levelsDb[lower]));
    curve.push(Math.round(levelDb * 100) / 100);
  }
  return curve;
}

/**
 * @param {string} label
 * @returns {Promise<{ frequency: number[], raw: number[] }>}
 */
async function readTargetFile(label) {
  const text = await (await fetch(`${repo}/targets/${encodeURIComponent(label)}.csv`)).text();
  const frequency = [];
  const raw = [];
  for (const line of text.trim().split("\n").slice(1)) {
    const [frequencyHz, levelDb] = line.split(",").map(Number);
    frequency.push(frequencyHz);
    raw.push(levelDb);
  }
  return { frequency, raw };
}

const appTargets = await (await fetch(`${repo}/webapp/data/targets.json`)).json();
const targets = [];
for (const label of families.flat()) {
  const fromApp = appTargets.find((target) => target.label === label);
  const curve = fromApp ? fromApp.fr : await readTargetFile(label);
  targets.push({ label, bassDb: fromApp ? fromApp.bassBoost.gain : 0, db: resample(curve.frequency, curve.raw) });
}

const rigFamilies = families.map((family) => {
  const measurements = appTargets.find((target) => target.label === family[0]).recommended;
  return { labels: family, measurements };
});

const data = { source: `${repo}/targets`, pointCount, families: rigFamilies, targets };
writeFileSync("src/targets.json", `${JSON.stringify(data)}\n`);
console.log(`src/targets.json holds ${targets.length} targets in ${rigFamilies.length} families`);

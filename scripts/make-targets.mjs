// Builds src/targets.json from the AutoEQ web app's target list and the matching curves in its targets folder.
import { writeFileSync } from "node:fs";
import { logSweepHz, sweepPointCount } from "../src/shared/bands.js";
import { clamp, logPosition } from "../src/shared/math.js";

const repo = "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master";

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

function resample(frequenciesHz, levelsDb) {
  const curve = [];

  for (const frequencyHz of logSweepHz(sweepPointCount)) {
    let upper = frequenciesHz.findIndex((each) => each >= frequencyHz);

    // A point below the first one takes the first two. A point past the last one takes the last two.
    if (upper === 0) upper = 1;
    if (upper < 0) upper = frequenciesHz.length - 1;

    const lower = upper - 1;
    const share = logPosition(frequencyHz, frequenciesHz[lower], frequenciesHz[upper]);
    const levelDb = levelsDb[lower] + (clamp(share, 0, 1) * (levelsDb[upper] - levelsDb[lower]));

    curve.push(Math.round(levelDb * 100) / 100);
  }

  return curve;
}

async function readTargetFile(label) {
  const text = await (await fetch(`${repo}/targets/${encodeURIComponent(label)}.csv`)).text();
  const frequenciesHz = [];
  const levelsDb = [];

  for (const line of text.trim().split("\n").slice(1)) {
    const [frequencyHz, levelDb] = line.split(",").map(Number);

    frequenciesHz.push(frequencyHz);
    levelsDb.push(levelDb);
  }

  return { frequenciesHz, levelsDb };
}

const appTargets = await (await fetch(`${repo}/webapp/data/targets.json`)).json();
const targets = [];

for (const label of families.flat()) {
  const fromApp = appTargets.find((target) => target.label === label);
  // The web app names the points of a curve frequency and raw.
  const curve = fromApp ? { frequenciesHz: fromApp.fr.frequency, levelsDb: fromApp.fr.raw } : await readTargetFile(label);

  targets.push({ label, bassDb: fromApp ? fromApp.bassBoost.gain : 0, curveDb: resample(curve.frequenciesHz, curve.levelsDb) });
}

const rigFamilies = families.map((family) => {
  const measurements = appTargets.find((target) => target.label === family[0]).recommended;
  return { labels: family, measurements };
});

const data = { source: `${repo}/targets`, pointCount: sweepPointCount, families: rigFamilies, targets };

writeFileSync("src/targets.json", `${JSON.stringify(data)}\n`);
console.log(`src/targets.json holds ${targets.length} targets in ${rigFamilies.length} families`);

// Fits a few bands to the difference between two target curves. AutoEQ's own file already tunes the
// headphone to its default target, so these bands only move that sound to the target you pick.
import { clamp, logSweepHz, responseDb, roundGainDb } from "./shared/filters.js";

/** @typedef {import("./shared/filters.js").Band} Band */

/** @typedef {{ label: string, bassDb: number, curveDb: number[] }} TargetCurve */

/** @typedef {{ band: Band, key: "frequencyHz" | "gainDb" | "q", min: number, max: number, step: number, isLog: boolean }} Knob */

const sweepHz = logSweepHz(121);
const oneKhzIndex = sweepHz.findIndex((frequencyHz) => frequencyHz >= 1000);
// Above 12 kHz the targets fall away steeply and differ by rig and by person, so the fit skips them.
const fitTopHz = 12_000;
const fittedPoints = sweepHz.filter((frequencyHz) => frequencyHz <= fitTopHz).length;
// AutoEQ lets its own file boost by 6 dB at most. The change of target keeps to the same limit.
const maxFitBoostDb = 6;
const maxPeakCount = 4;
const closeEnoughDb = 0.5;
const smallestGainDb = 0.2;

// AutoEQ puts the bass of a target in a 105 Hz shelf, apart from the curve.
/**
 * @param {TargetCurve} target
 * @returns {number[]}
 */
function readTargetDb(target) {
  const bassDb = responseDb([{ on: true, type: "LSC", frequencyHz: 105, gainDb: target.bassDb, q: 0.71 }], sweepHz);
  return target.curveDb.map((levelDb, index) => levelDb + bassDb[index]);
}

/**
 * @param {Band[]} bands
 * @param {number[]} curveDb
 * @returns {number}
 */
function measureMissDbSquared(bands, curveDb) {
  const playedDb = responseDb(bands, sweepHz);
  let total = 0;
  for (let index = 0; index < fittedPoints; index += 1) total += (curveDb[index] - playedDb[index]) ** 2;
  return total / fittedPoints;
}

/**
 * @param {Band} band
 * @returns {Knob[]}
 */
function makeKnobs(band) {
  const knobs = [{ band, key: "gainDb", min: -12, max: maxFitBoostDb, step: 1, isLog: false }];
  if (band.type === "PK") {
    knobs.push({ band, key: "frequencyHz", min: 20, max: 10_000, step: 0.25, isLog: true });
    knobs.push({ band, key: "q", min: 0.4, max: 4, step: 0.25, isLog: true });
  }
  if (band.type === "HSC") knobs.push({ band, key: "frequencyHz", min: 5000, max: fitTopHz, step: 0.25, isLog: true });
  return knobs;
}

// A frequency or a Q moves in octaves, so a step means the same at 50 Hz and at 5 kHz.
/**
 * @param {Knob} knob
 * @param {number} value
 * @param {number} direction
 * @returns {number}
 */
function moveKnob(knob, value, direction) {
  const moved = knob.isLog ? value * (2 ** (direction * knob.step)) : value + (direction * knob.step);
  return clamp(moved, knob.min, knob.max);
}

// Each knob tries a step up and a step down. A step that helps stays. A knob that cannot help
// halves its step, until every step is too small to matter.
/**
 * @param {Band[]} bands
 * @param {number[]} curveDb
 */
function refine(bands, curveDb) {
  const knobs = bands.flatMap(makeKnobs);
  const smallestStep = 0.01;
  let error = measureMissDbSquared(bands, curveDb);
  /**
   * @param {Knob} knob
   * @returns {boolean}
   */
  const tryStep = (knob) => {
    const before = knob.band[knob.key];
    for (const direction of [1, -1]) {
      knob.band[knob.key] = moveKnob(knob, before, direction);
      const next = measureMissDbSquared(bands, curveDb);
      if (next < error) {
        error = next;
        return true;
      }
    }
    knob.band[knob.key] = before;
    return false;
  };
  for (let round = 0; round < 80 && knobs.some((knob) => knob.step > smallestStep); round += 1) {
    for (const knob of knobs) if (!tryStep(knob)) knob.step /= 2;
  }
}

/**
 * @param {TargetCurve} from
 * @param {TargetCurve} to
 * @returns {Band[]}
 */
export function fitTargetChange(from, to) {
  const fromDb = readTargetDb(from);
  const toDb = readTargetDb(to);
  const oneKhzDb = toDb[oneKhzIndex] - fromDb[oneKhzIndex];
  const curveDb = toDb.map((db, index) => Math.min(db - fromDb[index] - oneKhzDb, maxFitBoostDb));

  const bands = [
    { on: true, type: "LSC", frequencyHz: 105, gainDb: 0, q: 0.71 },
    { on: true, type: "HSC", frequencyHz: 10_000, gainDb: 0, q: 0.71 },
  ];
  refine(bands, curveDb);
  // Each new peak goes where the fit misses most, then every band moves again.
  for (let count = 0; count < maxPeakCount; count += 1) {
    const playedDb = responseDb(bands, sweepHz);
    let worst = 0;
    for (let index = 1; index < fittedPoints; index += 1) {
      if (Math.abs(curveDb[index] - playedDb[index]) > Math.abs(curveDb[worst] - playedDb[worst])) worst = index;
    }
    const missDb = curveDb[worst] - playedDb[worst];
    if (Math.abs(missDb) < closeEnoughDb) break;
    bands.push({ on: true, type: "PK", frequencyHz: sweepHz[worst], gainDb: clamp(missDb, -12, maxFitBoostDb), q: 1.4 });
    refine(bands, curveDb);
  }

  return bands
    .filter((band) => Math.abs(band.gainDb) >= smallestGainDb)
    .map((band) => ({ ...band, frequencyHz: Math.round(band.frequencyHz), gainDb: roundGainDb(band.gainDb), q: Math.round(band.q * 100) / 100 }));
}

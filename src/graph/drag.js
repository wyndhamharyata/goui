// How a drag on a point or a side handle changes its band.
import { setBandFrequency, setBandGain, setBandQ } from "../shared/bands.js";
import { octavesBetween, octavesToQ } from "../shared/math.js";
import { placePoint, readPoint } from "./view.js";

/** @typedef {import("../shared/bands.js").Band} Band */

/** @typedef {import("./view.js").View} View */

/** @typedef {import("./view.js").Point} Point */

// A press on a point moves the band. A press on a side handle sets its Q.
/**
 * @typedef {object} Drag
 * @property {"move" | "q"} kind
 * @property {number} index
 * @property {number} startX
 * @property {number} startY
 * @property {number} startHz
 * @property {number} startDb
 * @property {boolean} [isMoving]
 * @property {boolean} [isFine]
 */

// A point moves from where it was grabbed, so it never jumps. Shift moves it a quarter as far.
/**
 * @param {View} view
 * @param {Band} band
 * @param {Drag} drag
 * @param {Point} pointer
 */
export function moveBand(view, band, drag, pointer) {
  const scale = drag.isFine ? 0.25 : 1;
  const start = placePoint(view, drag.startHz, drag.startDb);
  const target = readPoint(view, start.x + ((pointer.x - drag.startX) * scale), start.y + ((pointer.y - drag.startY) * scale));
  setBandFrequency(band, target.frequencyHz);
  setBandGain(band, target.gainDb);
}

// The handle is half the band's width out, so the width is twice the distance in octaves.
/**
 * @param {View} view
 * @param {Band} band
 * @param {Point} pointer
 */
export function setQFromPointer(view, band, pointer) {
  const pointerHz = readPoint(view, pointer.x, pointer.y).frequencyHz;
  const octaves = 2 * Math.abs(octavesBetween(band.frequencyHz, pointerHz));
  const narrowestOctaves = 0.05;
  setBandQ(band, octavesToQ(Math.max(octaves, narrowestOctaves)));
}

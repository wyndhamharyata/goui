// The goui icon as one acid tile and one ink mark on a 64 unit grid, for make-icons.mjs and the README and store pictures.

/** @typedef {{ left: number, top: number, right: number, bottom: number, radius: number }} RoundedRect */

/** @typedef {{ cx: number, cy: number, outerRadius: number, innerRadius: number }} Ring */

/** @typedef {{ cx: number, cy: number, radius: number }} Circle */

/** @typedef {{ x1: number, y1: number, x2: number, y2: number, radius: number }} Segment */

/** @typedef {{ bowl: Ring, dot: Circle, tail: Segment, point: Circle, light: Circle }} Mark */

/** @typedef {{ tile: RoundedRect, bowl: Ring, dot: Circle, tail: Segment, point: Circle, light: Circle }} IconLayout */

// The acid tile, the ink mark and the light in the point, the three colours design/logo.html draws the mark with.
export const tileColor = "#d4ff3f";
export const markColor = "#0b0c0e";
export const lightColor = "#f2f3f5";

// The store asks for 96 px of artwork inside a 128 px icon, so 16 px stays clear on every side.
export const storePaddingRatio = 16 / 128;
// A Mac app icon fills 824 of 1024 px, as Apple's icon grid has it.
export const macPaddingRatio = 100 / 1024;

// The mark's ink box, x 18 to 46 and y 10.5 to 53.5, so 28 by 43 grid units.
export const markInkBox = { left: 18, top: 10.5, right: 46, bottom: 53.5 };

// Inside the tile the mark grows until its height fills 48 of the 64 units, which is the safe box.
const markFillHeight = 48;

// The tail runs from (x1, y1) at the stem's top down to y2, then left to (x2, y2).
/**
 * @param {number} originX
 * @param {number} originY
 * @param {number} scale
 * @returns {Mark}
 */
export function layOutMark(originX, originY, scale) {
  const bowlX = originX + (32 * scale);
  const bowlY = originY + (24.5 * scale);
  const stemX = originX + (42.5 * scale);
  const pointX = originX + (21.5 * scale);
  const pointY = originY + (50 * scale);

  return {
    bowl: { cx: bowlX, cy: bowlY, outerRadius: 14 * scale, innerRadius: 7 * scale },
    dot: { cx: bowlX, cy: bowlY, radius: 3.5 * scale },
    tail: { x1: stemX, y1: bowlY, x2: pointX, y2: pointY, radius: 3.5 * scale },
    point: { cx: pointX, cy: pointY, radius: 3.5 * scale },
    light: { cx: pointX, cy: pointY, radius: 1.5 * scale },
  };
}

// The tile and the mark inside it. The padding is zero for the product, and the store's clear band or the Mac's grid when a picture asks for one.
/**
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {number} [paddingRatio]
 * @returns {IconLayout}
 */
export function layOutIcon(x, y, size, paddingRatio = 0) {
  const padding = size * paddingRatio;
  const artwork = size - (2 * padding);
  const scale = artwork / 64;
  const tile = { left: x + padding, top: y + padding, right: x + size - padding, bottom: y + size - padding, radius: 14 * scale };
  const markScale = markFillHeight / (markInkBox.bottom - markInkBox.top);
  const markSide = 32 * scale * (1 - markScale);

  return { tile, ...layOutMark(x + padding + markSide, y + padding + markSide, scale * markScale) };
}

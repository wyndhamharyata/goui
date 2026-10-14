// The goui icon as rounded rectangles: one tile and four white bars. make-icons.mjs paints them
// pixel by pixel. The README and store pictures draw them as SVG.

/** @typedef {{ left: number, top: number, right: number, bottom: number, radius: number }} RoundedRect */

// The tile fades from the first colour at the top to the second at the bottom.
export const tileColors = ["#4a7ae0", "#8f52d8"];

const barHeights = [0.4, 0.62, 0.48, 0.7];
// The store asks for 96 px of artwork inside a 128 px icon, so 16 px stays clear on every side.
const paddingRatio = 16 / 128;

/**
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @returns {{ tile: RoundedRect, bars: RoundedRect[] }}
 */
export function layOutIcon(x, y, size) {
  const padding = size * paddingRatio;
  const artwork = size - (2 * padding);
  const tile = { left: x + padding, top: y + padding, right: x + size - padding, bottom: y + size - padding, radius: artwork * 0.22 };

  const barWidth = artwork * 0.13;
  const barGap = artwork * 0.075;
  const totalWidth = (barHeights.length * barWidth) + ((barHeights.length - 1) * barGap);
  const firstBarX = tile.left + ((artwork - totalWidth) / 2);
  const baseY = tile.top + (artwork * 0.76);
  const bars = barHeights.map((height, index) => {
    const left = firstBarX + (index * (barWidth + barGap));
    return { left, top: baseY - (height * artwork), right: left + barWidth, bottom: baseY, radius: barWidth / 2 };
  });
  return { tile, bars };
}

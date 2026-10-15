// The parts the README and store pictures share: the colours of src/base.css, the goui tile and the frame.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { layOutIcon, tileColors } from "./icon-geometry.mjs";

function readColors(source) {
  const found = {};

  for (const line of source.split("\n")) {
    const text = line.trim();
    const colon = text.indexOf(":");
    const value = text.slice(colon + 1, -1).trim();
    const isColor = text.startsWith("--") && text.endsWith(";") && value.startsWith("#");

    if (isColor) found[text.slice(2, colon)] = value;
  }

  return found;
}

// Each hex colour token of src/base.css, under its token name, so the pictures match the panel.
/** @type {Record<string, string>} */
export const colors = readColors(readFileSync("src/base.css", "utf8"));

/**
 * @param {import("./icon-geometry.mjs").RoundedRect} box
 * @param {string} fill
 * @returns {string}
 */
function drawIconBox(box, fill) {
  return `<rect x="${box.left}" y="${box.top}" width="${box.right - box.left}" height="${box.bottom - box.top}" rx="${box.radius}" fill="${fill}"/>`;
}

// The goui icon with the inset of the real icon, so the pictures show the padding the store asks for.
/**
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @returns {string}
 */
export function drawGouiTile(x, y, size) {
  const { tile, bars } = layOutIcon(x, y, size);

  return drawIconBox(tile, "url(#tile)") + bars.map((bar) => drawIconBox(bar, "#ffffff")).join("");
}

// The tile gradient is always defined. A picture passes more defs, such as a glow, when it needs them.
/**
 * @param {number} width
 * @param {number} height
 * @param {string} content
 * @param {{ background?: string, defs?: string }} [options]
 * @returns {string}
 */
export function frame(width, height, content, options = {}) {
  const { background = colors["ink-1"], defs = "" } = options;
  const tile = `<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tileColors[0]}"/><stop offset="1" stop-color="${tileColors[1]}"/></linearGradient>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`
    + `<defs>${tile}${defs}</defs>`
    + `<rect width="${width}" height="${height}" fill="${background}"/>`
    + content
    + "</svg>";
}

// rsvg-convert comes with librsvg, `brew install librsvg` on a Mac. The size options go to it as they are, such as -z 2.
/**
 * @param {string} svg
 * @param {string} svgPath
 * @param {string} pngPath
 * @param {string[]} sizeOptions
 */
export function savePicture(svg, svgPath, pngPath, sizeOptions) {
  writeFileSync(svgPath, svg);
  execFileSync("rsvg-convert", [...sizeOptions, "-o", pngPath, svgPath]);
}

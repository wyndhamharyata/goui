// The parts the README and store pictures share: the colours of src/base.css, the goui tile and the frame.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { layOutIcon, lightColor, markColor, tileColor } from "./icon-geometry.mjs";

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
  const { tile, bowl, dot, tail, point, light } = layOutIcon(x, y, size);
  const strokeWidth = bowl.outerRadius - bowl.innerRadius;
  const ring = `<circle cx="${bowl.cx}" cy="${bowl.cy}" r="${(bowl.outerRadius + bowl.innerRadius) / 2}" fill="none" stroke="${markColor}" stroke-width="${strokeWidth}"/>`;
  const dotCircle = `<circle cx="${dot.cx}" cy="${dot.cy}" r="${dot.radius}" fill="${markColor}"/>`;
  const tailPath = `<path d="M${tail.x1} ${tail.y1}V${tail.y2}L${tail.x2} ${tail.y2}" fill="none" stroke="${markColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const pointCircle = `<circle cx="${point.cx}" cy="${point.cy}" r="${point.radius}" fill="${markColor}"/>`;
  const lightCircle = `<circle cx="${light.cx}" cy="${light.cy}" r="${light.radius}" fill="${lightColor}"/>`;

  return drawIconBox(tile, tileColor) + ring + dotCircle + tailPath + pointCircle + lightCircle;
}

// A picture passes more defs, such as a glow, when it needs them.
/**
 * @param {number} width
 * @param {number} height
 * @param {string} content
 * @param {{ background?: string, defs?: string }} [options]
 * @returns {string}
 */
export function frame(width, height, content, options = {}) {
  const { background = colors["ink-1"], defs = "" } = options;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`
    + `<defs>${defs}</defs>`
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

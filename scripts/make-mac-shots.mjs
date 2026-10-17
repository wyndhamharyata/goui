// Builds the two Mac photos in docs/images from raw screenshots: node scripts/make-mac-shots.mjs [wide.png] [narrow.png]
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { colors } from "./svg-parts.mjs";

const [widePath = `${process.env.HOME}/Desktop/Screenshot 2026-10-17 at 23.51.10.png`, narrowPath = `${process.env.HOME}/Desktop/Screenshot 2026-10-17 at 23.51.03.png`] = process.argv.slice(2);

// The share of light the screen keeps around the panel.
const dim = 0.38;
const ringWidth = 5;
// The corner of the panel window in a 2x screenshot. The desktop behind it blurs the corner too much to measure.
const cornerRadius = 26;
// The panel's own background, which marks out the panel on the screen.
const panelBackground = [14, 16, 19];

/**
 * @typedef {{ width: number, height: number, data: Buffer }} Picture
 * @typedef {{ left: number, top: number, right: number, bottom: number }} Box
 */

// ImageMagick 7 reads the screenshot and draws the photo, `brew install imagemagick` on a Mac.
function readPicture(path) {
  const [width, height] = execFileSync("magick", ["identify", "-quiet", "-format", "%w %h", path], { encoding: "utf8" }).split(" ").map(Number);
  const data = execFileSync("magick", ["-quiet", path, "-alpha", "off", "-depth", "8", "rgb:-"], { maxBuffer: (width * height * 3) + 1024 });

  return { width, height, data };
}

/**
 * @param {Picture} picture
 * @param {number} x
 * @param {number} y
 * @returns {number[]}
 */
function pixelAt(picture, x, y) {
  const index = ((y * picture.width) + x) * 3;
  return [picture.data[index], picture.data[index + 1], picture.data[index + 2]];
}

function isPanelBackground([red, green, blue]) {
  return red === panelBackground[0] && green === panelBackground[1] && blue === panelBackground[2];
}

// The window draws a light grey line inside a dark one, so the light line marks each side.
/**
 * @param {number[]} pixel
 * @returns {boolean}
 */
function isWindowBorder([red, green, blue]) {
  const sum = red + green + blue;
  return sum >= 90 && sum <= 135 && Math.abs(red - blue) <= 10;
}

/**
 * @param {number} from
 * @param {number} count
 * @param {(position: number) => boolean} test
 * @returns {boolean}
 */
function isMostly(from, count, test) {
  let hits = 0;

  for (let position = from; position < from + count; position++) if (test(position)) hits++;

  return hits / count > 0.8;
}

function borderRowTest(picture, inner) {
  return (y) => y >= 0 && y < picture.height && isMostly(inner.left + 60, inner.right - inner.left - 120, (x) => isWindowBorder(pixelAt(picture, x, y)));
}

function borderColumnTest(picture, inner) {
  return (x) => x >= 0 && x < picture.width && isMostly(inner.top + 60, inner.bottom - inner.top - 120, (y) => isWindowBorder(pixelAt(picture, x, y)));
}

// Walking in from outside, the first border line, then the dark outline one step outside it.
/**
 * @param {number} start
 * @param {number} step
 * @param {(line: number) => boolean} isBorder
 * @returns {number}
 */
function findOutline(start, step, isBorder) {
  for (let line = start; line !== start + (step * 240); line += step) {
    if (isBorder(line)) return line - step;
  }

  throw new Error("The window border was not found.");
}

// The columns and rows where the panel background runs long, then each side walked out to the window's dark outline.
function findPanel(picture) {
  const columnCounts = new Array(picture.width).fill(0);
  const rowCounts = new Array(picture.height).fill(0);

  for (let y = 0; y < picture.height; y++) {
    for (let x = 0; x < picture.width; x++) {
      if (isPanelBackground(pixelAt(picture, x, y))) {
        columnCounts[x]++;
        rowCounts[y]++;
      }
    }
  }

  const longColumns = columnCounts.flatMap((count, x) => (count >= 200 ? [x] : []));
  const longRows = rowCounts.flatMap((count, y) => (count >= 40 ? [y] : []));
  const inner = { left: longColumns[0], top: longRows[0], right: longColumns.at(-1), bottom: longRows.at(-1) };
  const isBorderRow = borderRowTest(picture, inner);
  const isBorderColumn = borderColumnTest(picture, inner);

  return {
    left: findOutline(inner.left - 40, 1, isBorderColumn),
    top: findOutline(Math.max(0, inner.top - 240), 1, isBorderRow),
    right: findOutline(inner.right + 40, -1, isBorderColumn),
    bottom: findOutline(Math.min(picture.height - 1, inner.bottom + 40), -1, isBorderRow),
  };
}

/**
 * @param {number[]} pixel
 * @returns {boolean}
 */
function isGlyph([red, green, blue]) {
  return Math.min(red, green, blue) >= 200;
}

// The menu bar extras start after a wide empty stretch right of the app menus. The goui icon is the first of them.
function findMenuIcon(picture, menuBarBottom) {
  const top = 4;
  const bottom = menuBarBottom - 6;
  const glyphs = [];

  for (let x = 0; x < picture.width; x++) {
    let isLit = false;

    for (let y = top; y < bottom && !isLit; y++) isLit = isGlyph(pixelAt(picture, x, y));

    if (!isLit) continue;

    const last = glyphs.at(-1);

    if (last && x - last.right <= 8) last.right = x;
    else glyphs.push({ left: x, right: x });
  }

  let widestSpace = 0;
  let icon = glyphs[0];

  for (let index = 1; index < glyphs.length; index++) {
    const space = glyphs[index].left - glyphs[index - 1].right;

    if (space > widestSpace) {
      widestSpace = space;
      icon = glyphs[index];
    }
  }

  let glyphTop = bottom;
  let glyphBottom = top;

  for (let x = icon.left; x <= icon.right; x++) {
    for (let y = top; y < bottom; y++) {
      if (isGlyph(pixelAt(picture, x, y))) {
        glyphTop = Math.min(glyphTop, y);
        glyphBottom = Math.max(glyphBottom, y);
      }
    }
  }

  return { cx: (icon.left + icon.right) / 2, cy: (glyphTop + glyphBottom) / 2 };
}

/**
 * @param {Box} box
 * @param {number} radius
 * @returns {string}
 */
function roundRectangle(box, radius) {
  return `roundrectangle ${box.left},${box.top} ${box.right},${box.bottom} ${radius},${radius}`;
}

/**
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @returns {string}
 */
function circle(cx, cy, radius) {
  return `circle ${cx},${cy} ${cx + radius},${cy}`;
}

/**
 * @param {Box} box
 * @param {number} distance
 * @returns {Box}
 */
function grow(box, distance) {
  return { left: box.left - distance, top: box.top - distance, right: box.right + distance, bottom: box.bottom + distance };
}

/**
 * @param {string} source
 * @param {string} output
 * @param {{ outputWidth: number, frame: (ring: Box, picture: Picture) => { x: number, y: number, width: number, height: number } }} options
 */
function makeShot(source, output, options) {
  const picture = readPicture(source);
  const panel = findPanel(picture);
  const icon = findMenuIcon(picture, panel.top);
  // The ring fills the menu bar's height around the icon, and the disc inside it stays lit.
  const iconRadius = icon.cy - 4 - ringWidth;
  const half = ringWidth / 2;
  // ImageMagick puts pixel centres on whole numbers, so the panel's outer edge is half a pixel out.
  const edge = grow(panel, 0.5);
  const ring = grow(edge, half);
  const crop = options.frame(ring, picture);
  const lit = [roundRectangle(edge, cornerRadius), circle(icon.cx, icon.cy, iconRadius)];
  const rings = [roundRectangle(ring, cornerRadius + half), circle(icon.cx, icon.cy, iconRadius + half)];

  console.log(`${source}\n  panel ${panel.left},${panel.top} to ${panel.right},${panel.bottom}. Icon at ${icon.cx},${icon.cy}. Crop ${crop.width}x${crop.height}+${crop.x}+${crop.y}.`);

  execFileSync("magick", [
    "-quiet", source, "-alpha", "off", "-strip",
    "(", "+clone", "-evaluate", "multiply", String(dim), ")",
    "(", "+clone", "-fill", "black", "-colorize", "100", "-fill", "white", ...lit.flatMap((figure) => ["-draw", figure]), ")",
    "(", "-clone", "0", "-clone", "2", "-alpha", "off", "-compose", "CopyOpacity", "-composite", ")",
    "-delete", "0,2", "-compose", "Over", "-composite", "-alpha", "off",
    "-fill", "none", "-stroke", colors.accent, "-strokewidth", String(ringWidth), ...rings.flatMap((figure) => ["-draw", figure]),
    "-crop", `${crop.width}x${crop.height}+${crop.x}+${crop.y}`, "+repage",
    "-resize", `${options.outputWidth}x`,
    "-quality", "82", "-sampling-factor", "2x2",
    output,
  ]);
  console.log(`  wrote ${output}`);
}

mkdirSync("docs/images", { recursive: true });

// The wide panel stands against the screen's right edge, so the photo keeps the screen on its left instead of centring it.
makeShot(widePath, "docs/images/mac-wide.jpg", {
  outputWidth: 2400,
  frame(ring, picture) {
    const x = Math.max(0, Math.floor(ring.left - 200));
    const height = Math.min(picture.height, Math.ceil(ring.bottom + 120));

    return { x, y: 0, width: picture.width - x, height };
  },
});

// The narrow panel is centred, in the 1424 by 2091 proportions of the earlier photo.
makeShot(narrowPath, "docs/images/mac-panel.jpg", {
  outputWidth: 1424,
  frame(ring, picture) {
    const height = Math.min(picture.height, Math.ceil(ring.bottom + 90));
    const width = Math.round(height * (1424 / 2091));
    const centre = (ring.left + ring.right) / 2;
    const x = Math.max(0, Math.min(picture.width - width, Math.round(centre - (width / 2))));

    return { x, y: 0, width, height };
  },
});

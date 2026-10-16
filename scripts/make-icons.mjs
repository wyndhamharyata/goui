import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { layOutIcon, layOutMark, lightColor, macPaddingRatio, markColor, markInkBox, storePaddingRatio, tileColor } from "./icon-geometry.mjs";

const extensionSizes = [16, 32, 48, 128];
// iconutil takes each size at 1x and at 2x, and makes the Mac app icon from them.
const macIconSizes = [16, 32, 128, 256, 512];
const macIconFolder = "mac/icons/AppIcon.iconset";
// A menu bar icon is 18 points, so 18 px and 36 px for a Retina screen.
const menuBarSizes = [18, 36];
const menuBarFillRatio = 0.85;
const samplesPerAxis = 4;

function crc32(buffer) {
  let crc = 0xff_ff_ff_ff;

  for (const byte of buffer) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xed_b8_83_20 : crc >>> 1;
  }

  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

/**
 * @param {string} type
 * @param {Buffer} data
 * @returns {Buffer}
 */
function encodeChunk(type, data) {
  const head = Buffer.from(type, "ascii");
  const body = Buffer.concat([head, data]);
  const length = Buffer.alloc(4);

  length.writeUInt32BE(data.length);

  const crc = Buffer.alloc(4);

  crc.writeUInt32BE(crc32(body));

  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);

  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);

  const bitDepth = 8;
  const colorTypeRgba = 6;

  header[8] = bitDepth;
  header[9] = colorTypeRgba;

  const rows = [];

  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]));
    rows.push(rgba.subarray(y * width * 4, (y + 1) * width * 4));
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    encodeChunk("IHDR", header),
    encodeChunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    encodeChunk("IEND", Buffer.alloc(0)),
  ]);
}

function isInsideRoundedRect(x, y, rect) {
  const nearX = Math.min(Math.max(x, rect.left + rect.radius), rect.right - rect.radius);
  const nearY = Math.min(Math.max(y, rect.top + rect.radius), rect.bottom - rect.radius);
  const distanceX = x - nearX;
  const distanceY = y - nearY;

  return (distanceX * distanceX) + (distanceY * distanceY) <= rect.radius * rect.radius;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {import("./icon-geometry.mjs").Ring} ring
 * @returns {boolean}
 */
function isInsideRing(x, y, { cx, cy, outerRadius, innerRadius }) {
  const distance = Math.hypot(x - cx, y - cy);

  return distance <= outerRadius && distance >= innerRadius;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {import("./icon-geometry.mjs").Circle} circle
 * @returns {boolean}
 */
function isInsideCircle(x, y, { cx, cy, radius }) {
  return Math.hypot(x - cx, y - cy) <= radius;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {import("./icon-geometry.mjs").Segment} segment
 * @returns {boolean}
 */
function isInsideSegment(x, y, { x1, y1, x2, y2, radius }) {
  const runX = x2 - x1;
  const runY = y2 - y1;
  const runSquared = (runX * runX) + (runY * runY);
  const along = Math.min(1, Math.max(0, (((x - x1) * runX) + ((y - y1) * runY)) / runSquared));

  return Math.hypot(x - (x1 + (along * runX)), y - (y1 + (along * runY))) <= radius;
}

// The tail runs down the stem's line and then across, so it tests as its two round capped segments.
/**
 * @param {number} x
 * @param {number} y
 * @param {import("./icon-geometry.mjs").Segment} tail
 * @returns {boolean}
 */
function isInsideTail(x, y, { x1, y1, x2, y2, radius }) {
  const stem = { x1, y1, x2: x1, y2, radius };
  const run = { x1, y1: y2, x2, y2, radius };

  return isInsideSegment(x, y, stem) || isInsideSegment(x, y, run);
}

/**
 * @param {string} hex
 * @returns {number[]}
 */
function readRgb(hex) {
  return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
}

// The acid tile with its ink mark reads on a light toolbar and on a dark one.
/**
 * @param {number} x
 * @param {number} y
 * @param {import("./icon-geometry.mjs").IconLayout} layout
 * @returns {number[]}
 */
function sampleTileColor(x, y, { tile, bowl, dot, tail, point, light }) {
  if (!isInsideRoundedRect(x, y, tile)) return [0, 0, 0, 0];
  if (isInsideCircle(x, y, light)) return [...readRgb(lightColor), 255];

  const isInk = isInsideRing(x, y, bowl) || isInsideCircle(x, y, dot) || isInsideTail(x, y, tail) || isInsideCircle(x, y, point);
  // Every colour keeps alpha 255. A three-value colour would write alpha 0 and the icon would be invisible.

  return isInk ? [...readRgb(markColor), 255] : [...readRgb(tileColor), 255];
}

// macOS colours a menu bar icon itself, so the mark is black and only its alpha counts.
function sampleMarkColor(x, y, { bowl, dot, tail, point }) {
  const isInk = isInsideRing(x, y, bowl) || isInsideCircle(x, y, dot) || isInsideTail(x, y, tail) || isInsideCircle(x, y, point);

  return isInk ? [0, 0, 0, 255] : [0, 0, 0, 0];
}

// The menu bar shows the mark alone, its ink box centred and 85 per cent of the icon.
function layOutMenuBarMark(size) {
  const markWidth = markInkBox.right - markInkBox.left;
  const markHeight = markInkBox.bottom - markInkBox.top;
  const scale = (size * menuBarFillRatio) / Math.max(markWidth, markHeight);
  const originX = ((size - (markWidth * scale)) / 2) - (markInkBox.left * scale);
  const originY = ((size - (markHeight * scale)) / 2) - (markInkBox.top * scale);
  const { bowl, dot, tail, point } = layOutMark(originX, originY, scale);

  return { bowl, dot, tail, point };
}

function samplePixel(x, y, readColor) {
  const total = [0, 0, 0, 0];

  for (let sampleY = 0; sampleY < samplesPerAxis; sampleY += 1) {
    for (let sampleX = 0; sampleX < samplesPerAxis; sampleX += 1) {
      const color = readColor(x + ((sampleX + 0.5) / samplesPerAxis), y + ((sampleY + 0.5) / samplesPerAxis));

      for (let channelIndex = 0; channelIndex < 4; channelIndex += 1) {
        total[channelIndex] += color[channelIndex];
      }
    }
  }

  const count = samplesPerAxis * samplesPerAxis;

  return total.map((sum) => Math.round(sum / count));
}

/**
 * @param {string} path
 * @param {number} size
 * @param {(x: number, y: number) => number[]} readColor
 */
function writeIcon(path, size, readColor) {
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) rgba.set(samplePixel(x, y, readColor), ((y * size) + x) * 4);
  }

  writeFileSync(path, encodePng(size, size, rgba));
}

mkdirSync("icons", { recursive: true });
mkdirSync(macIconFolder, { recursive: true });
mkdirSync("store", { recursive: true });

for (const size of extensionSizes) {
  const layout = layOutIcon(0, 0, size);

  writeIcon(`icons/icon${size}.png`, size, (x, y) => sampleTileColor(x, y, layout));
}

// The store listing asks for 96 px of artwork in a 128 px icon, so 16 px stays clear on every side.
const storeLayout = layOutIcon(0, 0, 128, storePaddingRatio);

writeIcon("store/icon-128.png", 128, (x, y) => sampleTileColor(x, y, storeLayout));

for (const size of macIconSizes) {
  for (const [scale, suffix] of [[1, ""], [2, "@2x"]]) {
    const layout = layOutIcon(0, 0, size * scale, macPaddingRatio);

    writeIcon(`${macIconFolder}/icon_${size}x${size}${suffix}.png`, size * scale, (x, y) => sampleTileColor(x, y, layout));
  }
}

for (const [index, size] of menuBarSizes.entries()) {
  const mark = layOutMenuBarMark(size);

  writeIcon(`mac/icons/menu-bar${index === 0 ? "" : "@2x"}.png`, size, (x, y) => sampleMarkColor(x, y, mark));
}

console.log("Wrote the acid tile icons at 16, 32, 48 and 128 px, the store icon, the Mac app icon set and the menu bar mark.");

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { layOutIcon, macPaddingRatio, tileColors } from "./icon-geometry.mjs";

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

function mixColor(start, end, at) {
  return start.map((value, index) => value + (end[index] - value) * at);
}

/**
 * @param {number} x
 * @param {number} y
 * @param {{ left: number, top: number, right: number, bottom: number, radius: number }} rect
 * @returns {boolean}
 */
function isInsideRoundedRect(x, y, rect) {
  const nearX = Math.min(Math.max(x, rect.left + rect.radius), rect.right - rect.radius);
  const nearY = Math.min(Math.max(y, rect.top + rect.radius), rect.bottom - rect.radius);
  const distanceX = x - nearX;
  const distanceY = y - nearY;

  return (distanceX * distanceX) + (distanceY * distanceY) <= rect.radius * rect.radius;
}

/**
 * @param {string} hex
 * @returns {number[]}
 */
function readRgb(hex) {
  return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
}

// A coloured tile with white bars reads on a light toolbar and on a dark one.
/**
 * @param {number} x
 * @param {number} y
 * @param {{ tile: import("./icon-geometry.mjs").RoundedRect, bars: import("./icon-geometry.mjs").RoundedRect[] }} layout
 * @returns {number[]}
 */
function sampleTileColor(x, y, { tile, bars }) {
  if (!isInsideRoundedRect(x, y, tile)) return [0, 0, 0, 0];
  if (bars.some((bar) => isInsideRoundedRect(x, y, bar))) return [255, 255, 255, 255];

  const tileColor = mixColor(readRgb(tileColors[0]), readRgb(tileColors[1]), (y - tile.top) / (tile.bottom - tile.top));
  // The tile keeps alpha 255. A three-value colour would write alpha 0 and the icon would be invisible.

  return [...tileColor, 255];
}

// macOS colours a menu bar icon itself, so the bars are black and only their alpha counts.
function sampleBarColor(x, y, bars) {
  return bars.some((bar) => isInsideRoundedRect(x, y, bar)) ? [0, 0, 0, 255] : [0, 0, 0, 0];
}

// The menu bar shows the bars alone, filling the icon, as other menu bar icons do.
function layOutMenuBarBars(size) {
  const { bars } = layOutIcon(0, 0, 1);
  const left = bars[0].left;
  const top = Math.min(...bars.map((bar) => bar.top));
  const width = bars.at(-1).right - left;
  const height = bars[0].bottom - top;
  const scale = (size * menuBarFillRatio) / Math.max(width, height);
  const offsetX = (size - (width * scale)) / 2;
  const offsetY = (size - (height * scale)) / 2;

  return bars.map((bar) => ({
    left: offsetX + ((bar.left - left) * scale),
    top: offsetY + ((bar.top - top) * scale),
    right: offsetX + ((bar.right - left) * scale),
    bottom: offsetY + ((bar.bottom - top) * scale),
    radius: bar.radius * scale,
  }));
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

for (const size of extensionSizes) {
  const layout = layOutIcon(0, 0, size);

  writeIcon(`icons/icon${size}.png`, size, (x, y) => sampleTileColor(x, y, layout));
}

for (const size of macIconSizes) {
  for (const [scale, suffix] of [[1, ""], [2, "@2x"]]) {
    const layout = layOutIcon(0, 0, size * scale, macPaddingRatio);

    writeIcon(`${macIconFolder}/icon_${size}x${size}${suffix}.png`, size * scale, (x, y) => sampleTileColor(x, y, layout));
  }
}

for (const [index, size] of menuBarSizes.entries()) {
  const bars = layOutMenuBarBars(size);

  writeIcon(`mac/icons/menu-bar${index === 0 ? "" : "@2x"}.png`, size, (x, y) => sampleBarColor(x, y, bars));
}

console.log("Wrote the extension icons at 16, 32, 48 and 128 px, the Mac app icon set and the menu bar icon.");

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { layOutIcon, tileColors } from "./icon-geometry.mjs";

const sizes = [16, 32, 48, 128];
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
function makeChunk(type, data) {
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
    makeChunk("IHDR", header),
    makeChunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    makeChunk("IEND", Buffer.alloc(0)),
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
function sampleColor(x, y, size) {
  const { tile, bars } = layOutIcon(0, 0, size);
  if (!isInsideRoundedRect(x, y, tile)) return [0, 0, 0, 0];
  if (bars.some((bar) => isInsideRoundedRect(x, y, bar))) return [255, 255, 255, 255];

  const tileColor = mixColor(readRgb(tileColors[0]), readRgb(tileColors[1]), (y - tile.top) / (tile.bottom - tile.top));
  // The tile keeps alpha 255. A three-value colour would write alpha 0 and the icon would be invisible.

  return [...tileColor, 255];
}

function samplePixel(x, y, size) {
  const total = [0, 0, 0, 0];
  for (let sampleY = 0; sampleY < samplesPerAxis; sampleY += 1) {
    for (let sampleX = 0; sampleX < samplesPerAxis; sampleX += 1) {
      const pointX = x + ((sampleX + 0.5) / samplesPerAxis);
      const pointY = y + ((sampleY + 0.5) / samplesPerAxis);
      const color = sampleColor(pointX, pointY, size);
      for (let channelIndex = 0; channelIndex < 4; channelIndex += 1) {
        total[channelIndex] += color[channelIndex];
      }
    }
  }
  const count = samplesPerAxis * samplesPerAxis;

  return total.map((sum) => Math.round(sum / count));
}

for (const size of sizes) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const color = samplePixel(x, y, size);
      const offset = (((y * size) + x) * 4);
      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = color[3];
    }
  }
  mkdirSync("icons", { recursive: true });
  writeFileSync(`icons/icon${size}.png`, encodePng(size, size, rgba));
}
console.log("Wrote icons at 16, 32, 48 and 128 pixels.");

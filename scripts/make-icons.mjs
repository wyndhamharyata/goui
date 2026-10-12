import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

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

function chunk(type, data) {
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
  header[8] = 8;
  header[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]));
    rows.push(rgba.subarray(y * width * 4, (y + 1) * width * 4));
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function mix(start, end, at) {
  return start.map((value, index) => value + (end[index] - value) * at);
}

function insideRoundedSquare(x, y, size) {
  const radius = size * 0.22;
  const far = size - radius;
  const cornerX = Math.min(Math.max(x, radius), far);
  const cornerY = Math.min(Math.max(y, radius), far);
  const dx = x - cornerX;
  const dy = y - cornerY;
  return dx * dx + dy * dy <= radius * radius;
}

const bars = [0.34, 0.6, 0.46, 0.74, 0.4];

function sampleColor(x, y, size) {
  if (!insideRoundedSquare(x, y, size)) return [0, 0, 0, 0];

  const background = mix([27, 34, 51], [14, 16, 20], y / size);
  const barWidth = size * 0.098;
  const barGap = size * 0.058;
  const totalWidth = bars.length * barWidth + (bars.length - 1) * barGap;
  const firstBarX = (size - totalWidth) / 2;
  const baseY = size * 0.76;

  for (let index = 0; index < bars.length; index += 1) {
    const left = firstBarX + index * (barWidth + barGap);
    const barTop = baseY - (bars[index] * size);
    if (x >= left && x <= left + barWidth && y >= barTop && y <= baseY) {
      return mix([91, 140, 255], [176, 107, 255], (y - barTop) / (baseY - barTop));
    }
  }
  return background;
}

function samplePixel(x, y, size) {
  const total = [0, 0, 0, 0];
  for (let sy = 0; sy < samplesPerAxis; sy += 1) {
    for (let sx = 0; sx < samplesPerAxis; sx += 1) {
      const px = x + ((sx + 0.5) / samplesPerAxis);
      const py = y + ((sy + 0.5) / samplesPerAxis);
      const color = sampleColor(px, py, size);
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

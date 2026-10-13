// Builds the Chrome Web Store images into store/. The screenshots come from a real browser run of the
// extension, at the 1280x800 the store asks for. The two promo tiles are drawn here and rendered with
// rsvg-convert, the same way as the README pictures.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const out = "store";
const panelSize = { width: 1280, height: 800 };
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const headphoneText = [
  "Preamp: -6.0 dB",
  "Filter 1: ON LSC Fc 105 Hz Gain -2.6 dB Q 0.70",
  "Filter 2: ON PK Fc 250 Hz Gain -2.5 dB Q 1.13",
  "Filter 3: ON PK Fc 539 Hz Gain 1.6 dB Q 2.60",
  "Filter 4: ON PK Fc 4491 Hz Gain 3.3 dB Q 5.83",
  "Filter 5: ON PK Fc 5617 Hz Gain 6.0 dB Q 2.71",
  "Filter 6: ON HSC Fc 10000 Hz Gain 1.1 dB Q 0.70",
].join("\n");
const earText = [
  "Preamp: 0.0 dB",
  "Filter 1: ON PK Fc 94 Hz Gain -5.0 dB Q 1.60",
  "Filter 2: ON PK Fc 7732 Hz Gain -3.0 dB Q 2.85",
].join("\n");

/**
 * @param {string} key
 * @returns {string}
 */
function extensionId(key) {
  const digest = createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32);
  return [...digest].map((digit) => String.fromCharCode(97 + parseInt(digit, 16))).join("");
}

/**
 * @param {import("@playwright/test").Page} panel
 * @param {string} role
 * @param {string} text
 * @returns {Promise<void>}
 */
async function pasteInto(panel, role, text) {
  const section = panel.locator(`.preset-section[data-role=${role}]`);
  if (!(await section.locator("[data-action=apply]").isVisible())) await section.locator("[data-action=paste]").click();
  await section.locator(".text").fill(text);
  await section.locator("[data-action=apply]").click();
}

/**
 * @param {import("@playwright/test").Page} panel
 * @param {string} role
 * @param {string} name
 * @returns {Promise<void>}
 */
async function saveAs(panel, role, name) {
  const section = panel.locator(`.preset-section[data-role=${role}]`);
  await section.locator("[data-action=saveAs]").click();
  await section.locator(".save-name").fill(name);
  await section.locator("[data-action=confirmSave]").click();
}

/**
 * @param {import("@playwright/test").BrowserContext} context
 * @param {import("@playwright/test").Page} page
 * @param {string} title
 * @returns {Promise<void>}
 */
async function pressIcon(context, page, title) {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"));
  await page.bringToFront();
  const details = { url: page.url(), title };
  await worker.evaluate(async (tabDetails) => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    chrome.action.onClicked.dispatch({ ...tab, ...tabDetails });
  }, details);
}

async function screenshots() {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(readFileSync("tests/fixtures/tone.html", "utf8"));
  });
  await new Promise((ready) => server.listen(0, ready));

  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "goui-store-")), {
    channel: "chromium",
    headless: true,
    viewport: panelSize,
    ignoreDefaultArgs: ["--mute-audio"],
    args: [
      `--disable-extensions-except=${process.cwd()}`,
      `--load-extension=${process.cwd()}`,
      `--allowlisted-extension-id=${extensionId(manifest.key)}`,
      "--autoplay-policy=no-user-gesture-required",
      "--disable-audio-output",
    ],
  });

  // Pink noise fills the spectrum, so the graph reads like a song rather than a single tone.
  const tone = await context.newPage();
  await tone.goto(`http://localhost:${server.address().port}/?noise`);
  await tone.click("#play");
  await tone.evaluate(() => {
    document.title = "Lofi radio";
  });
  await pressIcon(context, tone, "Lofi radio");

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId(manifest.key)}/src/panel.html`);
  await panel.waitForTimeout(600);
  await pasteInto(panel, "headphone", headphoneText);
  await pasteInto(panel, "ear", earText);
  await saveAs(panel, "headphone", "AKG N700NC M2");
  await saveAs(panel, "ear", "Ear test, 12 Oct");
  await panel.waitForTimeout(400);
  await panel.screenshot({ path: `${out}/screenshot-1-panel.png` });

  // A chosen band opens the inspector, and the table lists every number.
  await panel.locator("#chips .chip").nth(3).click();
  await panel.locator("details.card > summary").click();
  await panel.waitForTimeout(300);
  await panel.screenshot({ path: `${out}/screenshot-2-tune.png` });

  const guide = await context.newPage();
  await guide.goto(`chrome-extension://${extensionId(manifest.key)}/src/intro.html`);
  await guide.setViewportSize(panelSize);
  await guide.waitForTimeout(500);
  await guide.screenshot({ path: `${out}/screenshot-3-guide.png` });

  await context.close();
  server.close();

  // The store takes 24-bit PNGs with no alpha for the screenshots.
  for (const name of ["screenshot-1-panel.png", "screenshot-2-tune.png", "screenshot-3-guide.png"]) {
    execFileSync("convert", [`${out}/${name}`, "-background", "#0e1013", "-alpha", "remove", "-alpha", "off", `PNG24:${out}/${name}`]);
  }
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @returns {string}
 */
function gouiTile(x, y, size) {
  const bars = [0.4, 0.62, 0.48, 0.7];
  const padding = size * (16 / 128);
  const artwork = size - (2 * padding);
  const barWidth = artwork * 0.13;
  const barGap = artwork * 0.075;
  const totalWidth = bars.length * barWidth + (bars.length - 1) * barGap;
  const firstBarX = x + padding + (artwork - totalWidth) / 2;
  const baseY = y + padding + artwork * 0.76;
  const tile = `<rect x="${x + padding}" y="${y + padding}" width="${artwork}" height="${artwork}" rx="${artwork * 0.22}" fill="url(#tile)"/>`;
  const drawn = bars
    .map((height, index) => {
      const left = firstBarX + index * (barWidth + barGap);
      const top = baseY - height * artwork;
      return `<rect x="${left}" y="${top}" width="${barWidth}" height="${baseY - top}" rx="${barWidth / 2}" fill="#ffffff"/>`;
    })
    .join("");
  return tile + drawn;
}

/**
 * @param {number} width
 * @param {number} height
 * @param {string} content
 * @returns {string}
 */
function frame(width, height, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + "<defs>"
    + '<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a7ae0"/><stop offset="1" stop-color="#8f52d8"/></linearGradient>'
    + '<radialGradient id="glow" cx="0.5" cy="0.5" r="0.6"><stop offset="0" stop-color="#5b8cff" stop-opacity="0.55"/><stop offset="1" stop-color="#5b8cff" stop-opacity="0"/></radialGradient>'
    + "</defs>"
    + `<rect width="${width}" height="${height}" fill="#0b0d10"/>`
    + content
    + "</svg>";
}

// A smooth EQ curve across the tile, drawn from a few real bands.
function curvePath(width, height, lift) {
  const mid = height / 2;
  return [
    `M 0 ${mid}`,
    `C ${width * 0.12} ${mid + lift * 0.5} ${width * 0.2} ${mid - lift} ${width * 0.32} ${mid - lift * 0.7}`,
    `S ${width * 0.52} ${mid + lift * 0.4} ${width * 0.66} ${mid - lift * 0.2}`,
    `S ${width * 0.86} ${mid - lift * 0.9} ${width} ${mid}`,
  ].join(" ");
}

function tiles() {
  const small = frame(
    440,
    280,
    `<ellipse cx="220" cy="140" rx="260" ry="180" fill="url(#glow)"/>`
      + `<path d="${curvePath(440, 280, 78)}" fill="none" stroke="#5b8cff" stroke-width="6" stroke-linecap="round" opacity="0.8"/>`
      + gouiTile(145, 65, 150),
  );
  const marquee = frame(
    1400,
    560,
    `<ellipse cx="700" cy="280" rx="820" ry="360" fill="url(#glow)"/>`
      + `<path d="${curvePath(1400, 560, 150)}" fill="none" stroke="#5b8cff" stroke-width="10" stroke-linecap="round" opacity="0.75"/>`
      + gouiTile(600, 180, 200),
  );
  writeFileSync(`${out}/promo-small.svg`, small);
  writeFileSync(`${out}/promo-marquee.svg`, marquee);
  execFileSync("rsvg-convert", ["-w", "440", "-h", "280", "-o", `${out}/promo-small-440x280.png`, `${out}/promo-small.svg`]);
  execFileSync("rsvg-convert", ["-w", "1400", "-h", "560", "-o", `${out}/promo-marquee-1400x560.png`, `${out}/promo-marquee.svg`]);
  for (const name of ["promo-small-440x280.png", "promo-marquee-1400x560.png"]) {
    execFileSync("convert", [`${out}/${name}`, "-background", "#0b0d10", "-alpha", "remove", "-alpha", "off", `PNG24:${out}/${name}`]);
  }
}

mkdirSync(out, { recursive: true });
execFileSync("cp", ["icons/icon128.png", `${out}/icon-128.png`]);
await screenshots();
tiles();
console.log("Wrote store/icon-128.png, three screenshots and two promo tiles.");

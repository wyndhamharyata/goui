// Builds the store images: 1280x800 screenshots of a real run, and two promo tiles drawn as SVG.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync } from "node:fs";
import { extensionId, openBrowser, pasteInto, pressIcon, saveAs } from "../tests/helpers.js";
import { colors, drawGouiTile, frame, savePicture } from "./svg-parts.mjs";

const out = "store";
const panelSize = { width: 1280, height: 800 };
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

async function screenshots() {
  const { context, server, port } = await openBrowser(panelSize);

  // Pink noise fills the spectrum, so the graph reads like a song rather than a single tone.
  const tone = await context.newPage();

  await tone.goto(`http://localhost:${port}/?noise`);
  await tone.click("#play");
  await tone.evaluate(() => {
    document.title = "Lofi radio";
  });
  await pressIcon(context, tone);

  const panel = await context.newPage();

  await panel.goto(`chrome-extension://${extensionId}/src/panel.html`);
  await panel.waitForTimeout(600);
  await pasteInto(panel, "headphone", headphoneText);
  await pasteInto(panel, "ear", earText);
  await saveAs(panel, "headphone", "AKG N700NC M2");
  await saveAs(panel, "ear", "Ear test, 12 Oct");
  await panel.waitForTimeout(400);
  // The panel is taller than the screenshot, and saving scrolls it, so each shot starts at the header.
  await panel.evaluate(() => window.scrollTo(0, 0));
  await panel.screenshot({ path: `${out}/screenshot-1-panel.png` });

  // A chosen band opens the inspector, and the table lists every number.
  await panel.locator("#chips .ui-chip--band").nth(3).click();
  await panel.locator("details.ui-expander > summary").click();
  await panel.waitForTimeout(300);
  await panel.evaluate(() => window.scrollTo(0, 0));
  await panel.screenshot({ path: `${out}/screenshot-2-tune.png` });

  const guide = await context.newPage();

  await guide.goto(`chrome-extension://${extensionId}/src/intro.html`);
  await guide.setViewportSize(panelSize);
  await guide.waitForTimeout(500);
  await guide.screenshot({ path: `${out}/screenshot-3-guide.png` });

  await context.close();
  server.close();

  // The store takes 24-bit PNGs with no alpha for the screenshots.
  for (const name of ["screenshot-1-panel.png", "screenshot-2-tune.png", "screenshot-3-guide.png"]) {
    execFileSync("convert", [`${out}/${name}`, "-background", colors["ink-1"], "-alpha", "remove", "-alpha", "off", `PNG24:${out}/${name}`]);
  }
}

const glow = `<radialGradient id="glow" cx="0.5" cy="0.5" r="0.6"><stop offset="0" stop-color="${colors.accent}" stop-opacity="0.2"/><stop offset="1" stop-color="${colors.accent}" stop-opacity="0"/></radialGradient>`;

// A smooth EQ curve across the tile, drawn from a few real bands.
/**
 * @param {number} width
 * @param {number} height
 * @param {number} lift
 * @returns {string}
 */
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
      + `<path d="${curvePath(440, 280, 78)}" fill="none" stroke="${colors.accent}" stroke-width="6" stroke-linecap="round" opacity="0.8"/>`
      + drawGouiTile(145, 65, 150),
    { defs: glow },
  );
  const marquee = frame(
    1400,
    560,
    `<ellipse cx="700" cy="280" rx="820" ry="360" fill="url(#glow)"/>`
      + `<path d="${curvePath(1400, 560, 150)}" fill="none" stroke="${colors.accent}" stroke-width="10" stroke-linecap="round" opacity="0.75"/>`
      + drawGouiTile(600, 180, 200),
    { defs: glow },
  );

  savePicture(small, `${out}/promo-small.svg`, `${out}/promo-small-440x280.png`, ["-w", "440", "-h", "280"]);
  savePicture(marquee, `${out}/promo-marquee.svg`, `${out}/promo-marquee-1400x560.png`, ["-w", "1400", "-h", "560"]);

  for (const name of ["promo-small-440x280.png", "promo-marquee-1400x560.png"]) {
    execFileSync("convert", [`${out}/${name}`, "-background", colors["ink-1"], "-alpha", "remove", "-alpha", "off", "-strip", `PNG24:${out}/${name}`]);
  }
}

mkdirSync(out, { recursive: true });
// store/icon-128.png is written by scripts/make-icons.mjs, with the store's clear band around the artwork.
await screenshots();
tiles();

// The dashboard takes one file per field, so the six files are gathered into one folder to drag from.
const uploadFolder = "dist/store";
const uploadNames = ["icon-128.png", "screenshot-1-panel.png", "screenshot-2-tune.png", "screenshot-3-guide.png", "promo-small-440x280.png", "promo-marquee-1400x560.png"];

mkdirSync(uploadFolder, { recursive: true });

for (const name of uploadNames) cpSync(`${out}/${name}`, `${uploadFolder}/${name}`);

console.log(`Wrote three screenshots and two promo tiles, and the upload set in ${uploadFolder}.`);

// Draws each picture in docs/images as an SVG to edit by hand and a PNG for the README.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { layOutIcon, tileColors } from "./icon-geometry.mjs";

// The pictures name the zip of the version in the manifest, so they match the latest release.
const zipName = `goui-${JSON.parse(readFileSync("manifest.json", "utf8")).version}.zip`;

// The colours of src/base.css, so the pictures match the panel.
const palette = {
  background: "#0e1013",
  panel: "#161a20",
  panelRaised: "#1c2129",
  line: "#262d38",
  text: "#e6e9ef",
  muted: "#8993a2",
  accent: "#5b8cff",
  ear: "#ffd166",
  good: "#43d39e",
};

const bodyFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const monoFont = "'SF Mono', Menlo, Consolas, monospace";
const headFont = "Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const earBorder = palette.ear;
const headphoneBorder = "#a9b8ff";
const chromeText = "#e8eaed";

function escapeText(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function rect({ x = 0, y = 0, width, height, fill = palette.panel, stroke = "", radius = 0, strokeWidth = 1 }) {
  const outline = stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth}"` : "";
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}"${outline}/>`;
}

function circle({ cx, cy, r, fill = "none", stroke = "", strokeWidth = 2 }) {
  const outline = stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth}"` : "";
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${outline}/>`;
}

// A run of text. The anchor puts the middle or the end of the run at x.
function text({ x, y, content, size = 13, fill = palette.text, weight = 400, font = bodyFont, anchor = "start" }) {
  return `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeText(content)}</text>`;
}

// A right-pointing arrow from one x to another, on one line.
function arrow(fromX, toX, y, color = palette.muted) {
  return `<path d="M${fromX} ${y} H${toX}" stroke="${color}" stroke-width="1.6" fill="none"/>`
    + `<path d="M${toX} ${y} l-6 -3.5 v7 z" fill="${color}"/>`;
}

// The goui icon with the inset of the real icon, so the pictures show the padding the store asks for.
function icon(x, y, size) {
  const { tile, bars } = layOutIcon(x, y, size);
  /**
   * @param {import("./icon-geometry.mjs").RoundedRect} box
   * @param {string} fill
   * @returns {string}
   */
  const draw = (box, fill) => rect({ x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top, radius: box.radius, fill });

  return draw(tile, "url(#tile)") + bars.map((bar) => draw(bar, "#ffffff")).join("");
}

const defs = `<defs>
  <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${tileColors[0]}"/><stop offset="1" stop-color="${tileColors[1]}"/>
  </linearGradient>
  <clipPath id="boxClip"><rect x="0" y="0" width="176" height="92" rx="12"/></clipPath>
</defs>`;

function frame(width, height, content, { background = palette.background } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`
    + defs + rect({ x: 0, y: 0, width, height, fill: background }) + content + "</svg>";
}

function puzzleGlyph(x, y, size) {
  const scale = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path fill="#c4c7c5" d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-2 .9-2 2v3.8h1.5c1.49 0 2.7 1.21 2.7 2.7S4.99 16.2 3.5 16.2H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7s2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></g>`;
}

function pinGlyph(x, y, size, color) {
  const scale = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path fill="${color}" d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h6v7l1 1 1-1v-7h6v-2c-1.66 0-3-1.34-3-3z"/></g>`;
}

function downloadGlyph(x, y, size) {
  const scale = size / 16;
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M7 0 h2 v6 h3 l-4 4.5 -4-4.5 h3 z" fill="#ffffff"/><rect x="1" y="12" width="14" height="2" fill="#ffffff"/></g>`;
}

function folderGlyph(x, y, size, color) {
  const scale = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path fill="${color}" d="M4 4h6l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></g>`;
}

function cursor(x, y) {
  return `<g transform="translate(${x} ${y})"><path d="M0 0 l13 10.5 -6 0.7 3.2 6.8 -2.9 1.3 -3.1-6.9 -4.2 4z" fill="#ffffff" stroke="#000000" stroke-width="1.2"/></g>`;
}

// The tab bar and toolbar of a browser window, as the guide draws it.
function browserChrome(x, y, width, { tabTitle = "Lofi radio", url = "radio.example.com", showGoui = false, showOnBadge = false, highlight = "", cursorAt = null } = {}) {
  const parts = [];
  const tabHeight = 34;
  parts.push(rect({ x, y, width, height: tabHeight, radius: 10, fill: "#202124" }));
  parts.push(rect({ x: x + 10, y: y + 7, width: 150, height: tabHeight - 14, radius: 8, fill: "#292a2d" }));
  parts.push(circle({ cx: x + 26, cy: y + 17, r: 6, fill: "#8ab4f8" }));
  parts.push(text({ x: x + 40, y: y + 21, content: tabTitle, size: 12, fill: chromeText }));
  parts.push(text({ x: x + 178, y: y + 21, content: "Mail", size: 12, fill: "#9aa0a6" }));

  const barY = y + tabHeight + 8;
  const barHeight = 32;
  parts.push(rect({ x, y: barY, width, height: barHeight, radius: 10, fill: "#202124" }));
  parts.push(circle({ cx: x + 22, cy: barY + 16, r: 8, fill: "#303134" }));
  parts.push(rect({ x: x + 40, y: barY + 6, width: width - 120, height: barHeight - 12, radius: 8, fill: "#303134" }));
  parts.push(text({ x: x + 52, y: barY + 21, content: url, size: 12, fill: "#9aa0a6" }));

  const rightX = x + width - 44;
  if (showGoui) {
    const badge = showOnBadge
      ? circle({ cx: rightX + 14, cy: barY + 8, r: 8, fill: palette.good }) + text({ x: rightX + 14, y: barY + 12, content: "ON", size: 8, weight: 700, fill: palette.background, anchor: "middle" })
      : "";
    const ring = highlight === "goui" ? rect({ x: rightX - 6, y: barY + 2, width: 40, height: barHeight - 4, radius: 8, fill: "none", stroke: palette.accent, strokeWidth: 2 }) : "";
    parts.push(ring + icon(rightX, barY + 8, 16) + badge);
  }
  const puzzleX = x + width - 78;
  const puzzleRing = highlight === "puzzle" ? rect({ x: puzzleX - 8, y: barY + 2, width: 32, height: barHeight - 4, radius: 8, fill: "none", stroke: palette.accent, strokeWidth: 2 }) : "";
  parts.push(puzzleRing + puzzleGlyph(puzzleX, barY + 9, 14));
  parts.push(circle({ cx: x + width - 22, cy: barY + 16, r: 9, fill: "#5f6368" }));

  if (cursorAt) parts.push(cursor(cursorAt.x, cursorAt.y));

  return { svg: parts.join(""), bottom: barY + barHeight };
}

// The Extensions menu Chrome shows under the puzzle piece.
function extensionsMenu(x, y, { highlight = "" } = {}) {
  const width = 232;
  const height = 96;
  const parts = [rect({ x, y, width, height, radius: 12, fill: "#292a2d", stroke: "#3c4043" })];
  parts.push(text({ x: x + 14, y: y + 22, content: "Extensions", size: 11, fill: "#9aa0a6", weight: 500 }));
  const rowY = y + 34;
  const rowRing = highlight === "row" ? rect({ x: x + 6, y: rowY, width: width - 12, height: 34, radius: 8, fill: "none", stroke: palette.accent, strokeWidth: 2 }) : "";
  parts.push(rowRing + icon(x + 14, rowY + 5, 24));
  parts.push(text({ x: x + 48, y: rowY + 22, content: "goui", size: 13, fill: chromeText }));
  parts.push(pinGlyph(x + width - 30, rowY + 8, 16, highlight === "pin" ? palette.accent : "#9aa0a6"));

  return { svg: parts.join(""), width, height };
}

// The same menu with one row, for a card with little room under the toolbar.
function compactExtensionsMenu(x, y, { highlight = "" } = {}) {
  const width = 196;
  const height = 46;
  const parts = [rect({ x, y, width, height, radius: 10, fill: "#292a2d", stroke: "#3c4043" })];
  const rowRing = highlight === "row" ? rect({ x: x + 5, y: y + 5, width: width - 10, height: 36, radius: 8, fill: "none", stroke: palette.accent, strokeWidth: 2 }) : "";
  parts.push(rowRing + icon(x + 12, y + 11, 22));
  parts.push(text({ x: x + 44, y: y + 29, content: "goui", size: 12, fill: chromeText }));
  parts.push(pinGlyph(x + width - 26, y + 14, 15, highlight === "pin" ? palette.accent : "#9aa0a6"));

  return parts.join("");
}

// A numbered step for the install flow, with its picture above the words.
function stepCard(x, y, width, step) {
  const height = 250;
  const parts = [
    rect({ x, y, width, height, radius: 14, fill: palette.panel, stroke: palette.line }),
    circle({ cx: x + 26, cy: y + 30, r: 14, fill: palette.accent }),
    text({ x: x + 26, y: y + 35, content: String(step.number), size: 14, weight: 700, fill: "#ffffff", anchor: "middle" }),
    text({ x: x + 50, y: y + 30, content: step.title, size: 15, weight: 700 }),
    text({ x: x + 50, y: y + 48, content: step.note, size: 12, fill: palette.muted }),
    step.picture(x + 18, y + 70, width - 36),
  ];

  return { svg: parts.join(""), height };
}

// The extensions page with Developer mode on and its Load unpacked button.
function pictureLoadUnpacked(x, y, width) {
  const height = 158;
  const parts = [rect({ x, y, width, height, radius: 10, fill: palette.panelRaised })];
  parts.push(text({ x: x + 14, y: y + 24, content: "chrome://extensions", size: 11, fill: palette.muted, font: monoFont }));
  parts.push(text({ x: x + 14, y: y + 52, content: "Extensions", size: 14, weight: 700 }));
  parts.push(text({ x: x + 14, y: y + 72, content: "Keyboard shortcuts", size: 11, fill: palette.muted }));
  parts.push(rect({ x: x + 12, y: y + 86, width: width - 24, height: 30, radius: 8, fill: palette.panel, stroke: palette.line }));
  parts.push(text({ x: x + 24, y: y + 105, content: "Developer mode", size: 11 }));
  parts.push(rect({ x: x + width - 56, y: y + 94, width: 32, height: 18, radius: 9, fill: palette.good }));
  parts.push(circle({ cx: x + width - 32, cy: y + 103, r: 6, fill: "#ffffff" }));
  parts.push(rect({ x: x + 12, y: y + 124, width: width - 24, height: 24, radius: 6, fill: palette.accent }));
  parts.push(text({ x: x + width / 2, y: y + 140, content: "Load unpacked", size: 11, weight: 700, fill: "#ffffff", anchor: "middle" }));
  parts.push(cursor(x + 70, y + 146));

  return parts.join("");
}

// The Releases page with the zip asset.
function pictureDownload(x, y, width) {
  const height = 158;
  const parts = [rect({ x, y, width, height, radius: 10, fill: palette.panelRaised })];
  parts.push(text({ x: x + 14, y: y + 24, content: "github.com/goui/releases", size: 10, fill: palette.muted, font: monoFont }));
  parts.push(text({ x: x + 14, y: y + 50, content: "Releases", size: 14, weight: 700 }));
  parts.push(rect({ x: x + 92, y: y + 37, width: 56, height: 18, radius: 9, fill: palette.panel, stroke: palette.line }));
  parts.push(text({ x: x + 120, y: y + 50, content: "Latest", size: 9, fill: palette.good, anchor: "middle" }));
  parts.push(rect({ x: x + 12, y: y + 62, width: width - 24, height: 34, radius: 8, fill: palette.panel, stroke: palette.line }));
  parts.push(text({ x: x + 22, y: y + 83, content: zipName, size: 10, font: monoFont }));
  parts.push(circle({ cx: x + width - 30, cy: y + 79, r: 12, fill: palette.accent }));
  parts.push(downloadGlyph(x + width - 36, y + 73, 12));
  parts.push(cursor(x + width - 34, y + 94));
  parts.push(text({ x: x + 14, y: y + 116, content: "Unzip it. Double clicking is enough.", size: 10, fill: palette.muted }));
  parts.push(folderGlyph(x + 14, y + 124, 16, palette.muted));
  parts.push(text({ x: x + 36, y: y + 138, content: "the goui folder", size: 10, fill: palette.muted }));

  return parts.join("");
}

// The folder picker with the goui folder chosen.
function picturePickFolder(x, y, width) {
  const height = 158;
  const parts = [rect({ x, y, width, height, radius: 10, fill: palette.panelRaised })];
  parts.push(text({ x: x + 14, y: y + 22, content: "Choose the goui folder", size: 11, fill: palette.muted }));
  parts.push(rect({ x: x + 14, y: y + 32, width: width - 28, height: 100, radius: 8, fill: palette.panel, stroke: palette.line }));
  parts.push(rect({ x: x + 26, y: y + 44, width: 120, height: 22, radius: 5, fill: palette.panelRaised }));
  parts.push(text({ x: x + 34, y: y + 59, content: "goui", size: 12 }));
  parts.push(text({ x: x + 34, y: y + 82, content: "manifest.json", size: 11, fill: palette.muted, font: monoFont }));
  parts.push(text({ x: x + 34, y: y + 100, content: "src", size: 11, fill: palette.muted, font: monoFont }));
  parts.push(text({ x: x + 34, y: y + 118, content: "icons", size: 11, fill: palette.muted, font: monoFont }));
  parts.push(rect({ x: x + width - 118, y: y + 116, width: 96, height: 22, radius: 6, fill: palette.accent }));
  parts.push(text({ x: x + width - 70, y: y + 131, content: "Open", size: 11, weight: 700, fill: "#ffffff", anchor: "middle" }));

  return parts.join("");
}

// The toolbar with the pin pressed, and the short menu below it.
function picturePin(x, y, width) {
  const chrome = browserChrome(x, y, width, { highlight: "puzzle" });
  const menu = compactExtensionsMenu(x + width - 210, chrome.bottom + 6, { highlight: "pin" });
  return chrome.svg + menu;
}

// The toolbar with the goui icon pressed and its green ON badge.
function picturePanel(x, y, width) {
  return browserChrome(x, y, width, { showGoui: true, showOnBadge: true, highlight: "goui", cursorAt: { x: width - 112, y: 96 } }).svg;
}

// The side panel, as it looks once goui hears a tab.
function sidePanel(x, y, width) {
  const height = 168;
  const parts = [rect({ x, y, width, height, radius: 12, fill: palette.panel, stroke: palette.line })];
  parts.push(text({ x: x + 14, y: y + 26, content: "goui", size: 14, weight: 700 }));
  parts.push(rect({ x: x + 74, y: y + 12, width: 26, height: 18, radius: 4, fill: palette.panelRaised, stroke: palette.line }));
  parts.push(text({ x: x + 87, y: y + 25, content: "A/B", size: 9, fill: palette.muted, anchor: "middle" }));
  parts.push(rect({ x: x + 108, y: y + 12, width: 26, height: 18, radius: 9, fill: palette.good }));
  parts.push(circle({ cx: x + 126, cy: y + 21, r: 6, fill: "#ffffff" }));
  parts.push(text({ x: x + 14, y: y + 50, content: "playing", size: 12, fill: palette.muted }));
  parts.push(text({ x: x + width - 14, y: y + 50, content: "-24.0 dB", size: 12, fill: palette.good, anchor: "end" }));
  parts.push(text({ x: x + 14, y: y + 70, content: "Lofi radio", size: 12 }));
  const tabs = ["Listen", "Tune", "Library"];
  tabs.forEach((label, index) => {
    const tabX = x + 12 + (index * 68);
    const isOn = index === 0;
    parts.push(rect({ x: tabX, y: y + 82, width: 62, height: 22, radius: 11, fill: isOn ? palette.accent : palette.panelRaised }));
    parts.push(text({ x: tabX + 31, y: y + 97, content: label, size: 10, fill: isOn ? "#ffffff" : palette.muted, anchor: "middle" }));
  });
  parts.push(rect({ x: x + 12, y: y + 112, width: width - 24, height: 46, radius: 8, fill: palette.panelRaised }));
  parts.push(text({ x: x + 24, y: y + 132, content: "1  Headphone", size: 11 }));
  parts.push(text({ x: x + 24, y: y + 150, content: "2  My ear", size: 11, fill: palette.muted }));

  return parts.join("");
}

// The sound path: the tab, then the two layers, then the taste sliders, then you.
function makeHowItWorks() {
  const width = 1120;
  const height = 240;
  const boxWidth = 176;
  const gap = 40;
  const startX = 40;
  const boxY = 92;
  const boxHeight = 92;
  const boxes = [
    { title: "Tab audio", note: "Any tab", tone: "plain" },
    { title: "Headphone", note: "AutoEQ baseline", tone: "headphone" },
    { title: "My ear", note: "EQByEar test", tone: "ear" },
    { title: "Your taste", note: "Bass, Vocals, Treble", tone: "plain" },
    { title: "You", note: "Headphones on", tone: "plain" },
  ];
  const parts = [
    text({ x: 40, y: 46, content: "How the sound flows", size: 20, weight: 700, font: headFont }),
    text({ x: 40, y: 68, content: "goui joins two audio tools. Each one corrects a different thing.", size: 13, fill: palette.muted }),
  ];
  const borders = { plain: palette.line, headphone: headphoneBorder, ear: earBorder };
  boxes.forEach((box, index) => {
    const x = startX + (index * (boxWidth + gap));
    parts.push(rect({ x, y: boxY, width: boxWidth, height: boxHeight, radius: 12, fill: palette.panel, stroke: borders[box.tone] }));
    if (box.tone !== "plain") {
      parts.push(`<g clip-path="url(#boxClip)" transform="translate(${x} ${boxY})">${rect({ x: 0, y: 0, width: 8, height: boxHeight, fill: borders[box.tone] })}</g>`);
    }
    parts.push(text({ x: x + (boxWidth / 2), y: boxY + 40, content: box.title, size: 16, weight: 700, anchor: "middle" }));
    parts.push(text({ x: x + (boxWidth / 2), y: boxY + 64, content: box.note, size: 12, fill: palette.muted, anchor: "middle" }));
    if (index < boxes.length - 1) parts.push(arrow(x + boxWidth + 8, x + boxWidth + gap - 8, boxY + (boxHeight / 2)));
  });
  parts.push(text({ x: 40, y: 214, content: "Headphone and My ear add up in dB, so the two layers merge with no loss.", size: 12, fill: palette.muted }));

  return frame(width, height, parts.join(""));
}

// The install flow: four numbered cards in a row.
function makeInstallFlow() {
  const width = 1120;
  const cardWidth = 254;
  const gap = 32;
  const steps = [
    { number: 1, title: "Download the zip", note: "From the Releases page", picture: pictureDownload },
    { number: 2, title: "Load the folder", note: "chrome://extensions", picture: pictureLoadUnpacked },
    { number: 3, title: "Pin goui", note: "Press the pin in the menu", picture: picturePin },
    { number: 4, title: "Click the icon", note: "The panel opens", picture: picturePanel },
  ];
  const parts = [
    text({ x: 40, y: 46, content: "Install goui in four steps", size: 20, weight: 700, font: headFont }),
    text({ x: 40, y: 68, content: "Download the zip and unzip it. Then load the folder in Chrome.", size: 13, fill: palette.muted }),
  ];
  steps.forEach((step, index) => {
    const x = 40 + (index * (cardWidth + gap));
    parts.push(stepCard(x, 96, cardWidth, step).svg);
    if (index < steps.length - 1) parts.push(arrow(x + cardWidth + 6, x + cardWidth + gap - 6, 220));
  });

  return frame(width, 366, parts.join(""));
}

function makeLoadUnpacked() {
  const width = 720;
  const height = 300;
  const parts = [
    text({ x: 32, y: 44, content: "Step 2. Load the folder in Chrome", size: 19, weight: 700, font: headFont }),
    text({ x: 32, y: 68, content: "Type chrome://extensions in the address bar, or brave://extensions in Brave.", size: 13, fill: palette.muted }),
    text({ x: 32, y: 88, content: "Turn on Developer mode at the top right. The Load unpacked button then appears.", size: 13, fill: palette.muted }),
    pictureLoadUnpacked(32, 108, width - 64),
  ];

  return frame(width, height, parts.join(""));
}

function makeDownload() {
  const width = 720;
  const height = 330;
  const parts = [
    text({ x: 32, y: 44, content: "Step 1. Download the zip", size: 19, weight: 700, font: headFont }),
    text({ x: 32, y: 68, content: `Open the Releases page on GitHub. Press ${zipName} under the newest release.`, size: 13, fill: palette.muted }),
    text({ x: 32, y: 88, content: "Unzip the file after the download. Double clicking it is enough.", size: 13, fill: palette.muted }),
  ];
  parts.push(rect({ x: 32, y: 108, width: 398, height: 150, radius: 12, fill: palette.panel, stroke: palette.line }));
  parts.push(text({ x: 48, y: 134, content: "github.com/wyndhamharyata/goui/releases", size: 11, fill: palette.muted, font: monoFont }));
  parts.push(text({ x: 48, y: 168, content: "Releases", size: 16, weight: 700 }));
  parts.push(rect({ x: 140, y: 152, width: 62, height: 20, radius: 10, fill: palette.panelRaised, stroke: palette.line }));
  parts.push(text({ x: 171, y: 166, content: "Latest", size: 10, fill: palette.good, anchor: "middle" }));
  parts.push(rect({ x: 48, y: 184, width: 366, height: 40, radius: 8, fill: palette.panelRaised, stroke: palette.line }));
  parts.push(text({ x: 64, y: 209, content: zipName, size: 12, font: monoFont }));
  parts.push(rect({ x: 312, y: 192, width: 88, height: 24, radius: 6, fill: palette.accent }));
  parts.push(text({ x: 356, y: 208, content: "Download", size: 11, weight: 700, fill: "#ffffff", anchor: "middle" }));
  parts.push(cursor(392, 218));
  parts.push(arrow(438, 486, 200));
  parts.push(text({ x: 462, y: 188, content: "unzip", size: 11, fill: palette.muted, anchor: "middle" }));
  parts.push(rect({ x: 490, y: 150, width: 198, height: 108, radius: 12, fill: palette.panelRaised, stroke: palette.line }));
  parts.push(folderGlyph(510, 172, 44, palette.accent));
  parts.push(text({ x: 566, y: 196, content: "goui", size: 15, weight: 700 }));
  parts.push(text({ x: 566, y: 216, content: "the unzipped folder", size: 11, fill: palette.muted }));
  parts.push(text({ x: 510, y: 240, content: "Keep it where it is.", size: 11, fill: palette.muted }));

  return frame(width, height, parts.join(""));
}

function makePickFolder() {
  const width = 720;
  const height = 300;
  const parts = [
    text({ x: 32, y: 44, content: "Pick the goui folder", size: 19, weight: 700, font: headFont }),
    text({ x: 32, y: 68, content: "The Load unpacked button asks for a folder. Choose the one that holds manifest.json.", size: 13, fill: palette.muted }),
    text({ x: 32, y: 88, content: "Keep the folder where it is. Chrome reads it every time it starts.", size: 13, fill: palette.muted }),
    picturePickFolder(32, 108, width - 64),
  ];

  return frame(width, height, parts.join(""));
}

function makePin() {
  const width = 720;
  const height = 340;
  const parts = [
    text({ x: 32, y: 44, content: "Step 3. Pin goui", size: 19, weight: 700, font: headFont }),
    text({ x: 32, y: 68, content: "Click the puzzle piece in the toolbar. Press the pin beside goui.", size: 13, fill: palette.muted }),
    text({ x: 32, y: 88, content: "The goui icon then stays in the toolbar, one click away.", size: 13, fill: palette.muted }),
  ];
  const chrome = browserChrome(32, 108, width - 64, { highlight: "puzzle" });
  parts.push(chrome.svg);
  parts.push(rect({ x: 32, y: chrome.bottom + 6, width: width - 64, height: 96, radius: 10, fill: palette.panel, stroke: palette.line }));
  parts.push(text({ x: 48, y: chrome.bottom + 34, content: "radio.example.com", size: 12, fill: palette.muted, font: monoFont }));
  parts.push(text({ x: 48, y: chrome.bottom + 58, content: "A page keeps playing under the menu.", size: 12, fill: palette.muted }));
  parts.push(extensionsMenu(width - 300, chrome.bottom + 4, { highlight: "pin" }).svg);

  return frame(width, height, parts.join(""));
}

function makeClickIcon() {
  const width = 720;
  const height = 320;
  const chromeWidth = 420;
  const parts = [
    text({ x: 32, y: 44, content: "Step 4. Click the goui icon", size: 19, weight: 700, font: headFont }),
    text({ x: 32, y: 68, content: "Open a page with sound. Click the goui icon on that page.", size: 13, fill: palette.muted }),
    text({ x: 32, y: 88, content: "The side panel opens, and the icon shows a green ON.", size: 13, fill: palette.muted }),
    browserChrome(32, 108, chromeWidth, { showGoui: true, showOnBadge: true, highlight: "goui", cursorAt: { x: chromeWidth - 46, y: 202 } }).svg,
    sidePanel(476, 108, 220),
  ];

  return frame(width, height, parts.join(""));
}

const images = {
  "install-download": makeDownload(),
  "install-flow": makeInstallFlow(),
  "install-load-unpacked": makeLoadUnpacked(),
  "install-pick-folder": makePickFolder(),
  "install-pin": makePin(),
  "install-click-icon": makeClickIcon(),
  "how-it-works": makeHowItWorks(),
};

mkdirSync("docs/images", { recursive: true });
for (const [name, svg] of Object.entries(images)) {
  writeFileSync(`docs/images/${name}.svg`, svg);
  execFileSync("rsvg-convert", ["-z", "2", "-o", `docs/images/${name}.png`, `docs/images/${name}.svg`]);
  console.log(`docs/images/${name}.svg and .png`);
}
console.log(`Wrote ${Object.keys(images).length} pictures.`);

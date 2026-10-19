// Copies the icons, the pictures, the icon sprite, the help's sheets, the version and the design's panel into public/. The design mounts only the hosts a page has.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoFolder = fileURLToPath(new URL("../../", import.meta.url));
const publicFolder = fileURLToPath(new URL("../public/", import.meta.url));
const pictureNames = ["install-flow.png", "mac-menu.jpg", "mac-panel.jpg", "mac-wide.jpg"];
// The Mac page wears the built-in help's design, so it loads the help's own sheets.
const helpSheetNames = ["guide.css", "intro.css"];

mkdirSync(`${publicFolder}images`, { recursive: true });
cpSync(`${repoFolder}icons`, `${publicFolder}icons`, { recursive: true });
cpSync(`${repoFolder}src/fonts`, `${publicFolder}fonts`, { recursive: true });

for (const name of pictureNames) cpSync(`${repoFolder}docs/images/${name}`, `${publicFolder}images/${name}`);
for (const name of helpSheetNames) cpSync(`${repoFolder}src/${name}`, `${publicFolder}${name}`);

// The Mac page shows the version beside its name, as the help does. It comes from the manifest, never typed by hand.
const manifest = JSON.parse(readFileSync(`${repoFolder}manifest.json`, "utf8"));

writeFileSync(`${publicFolder}version.js`, `document.getElementById("version").textContent = "v${manifest.version}";\n`);

// The design sheet names the fonts from src/, so the copy points them at public/fonts/.
const designCss = readFileSync(`${repoFolder}design/ux-proposals.css`, "utf8").replaceAll("../src/fonts/", "fonts/");

cpSync(`${repoFolder}design/ux-proposals.js`, `${publicFolder}panel.js`);
writeFileSync(`${publicFolder}panel.css`, designCss);

// The design page holds the one icon sprite. The site loads it from sprite.svg, so the two never differ.
const designPage = readFileSync(`${repoFolder}design/ux-proposals.html`, "utf8");
const spriteStart = designPage.indexOf("<svg");
const spriteEnd = designPage.indexOf("</svg>", spriteStart) + "</svg>".length;

const sprite = designPage.slice(spriteStart, spriteEnd).replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');

writeFileSync(`${publicFolder}sprite.svg`, sprite);
console.log(`Copied the icons, ${pictureNames.length} pictures, the icon sprite, the fonts, the help's sheets, version ${manifest.version} and the design's panel.`);

// Copies the icons, the pictures, the icon sprite and the design's panel into public/. The design mounts only the hosts a page has.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoFolder = fileURLToPath(new URL("../../", import.meta.url));
const publicFolder = fileURLToPath(new URL("../public/", import.meta.url));
const pictureNames = ["how-it-works.png", "install-flow.png", "mac-panel.jpg", "mac-wide.jpg"];

mkdirSync(`${publicFolder}images`, { recursive: true });
cpSync(`${repoFolder}icons`, `${publicFolder}icons`, { recursive: true });

for (const name of pictureNames) cpSync(`${repoFolder}docs/images/${name}`, `${publicFolder}images/${name}`);

cpSync(`${repoFolder}design/ux-proposals.js`, `${publicFolder}panel.js`);
cpSync(`${repoFolder}design/ux-proposals.css`, `${publicFolder}panel.css`);

// The design page holds the one icon sprite. The site loads it from sprite.svg, so the two never differ.
const designPage = readFileSync(`${repoFolder}design/ux-proposals.html`, "utf8");
const spriteStart = designPage.indexOf("<svg");
const spriteEnd = designPage.indexOf("</svg>", spriteStart) + "</svg>".length;

const sprite = designPage.slice(spriteStart, spriteEnd).replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');

writeFileSync(`${publicFolder}sprite.svg`, sprite);
console.log(`Copied the icons, ${pictureNames.length} pictures, the icon sprite and the design's panel.`);

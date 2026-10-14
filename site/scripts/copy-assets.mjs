// Copies the icons, the pictures and the panel mock into public/. The mock shows design F alone.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const repo = "..";

/**
 * @param {string} source
 * @returns {{ text: string, blockCount: number }}
 */
function runBlocksOnTheirOwnPage(source) {
  const lines = source.split("\n");
  let blockCount = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== "{") continue;
    const end = lines.indexOf("}", index + 1);
    const body = lines.slice(index + 1, end).join("\n");
    const found = body.match(/byId\("([a-z]+)-/) ?? body.match(/mountTabs\("([a-z]+)-/);
    if (!found) continue;
    blockCount += 1;
    lines[index] = `if (byId("${found[1]}-head")) {`;
  }

  return { text: lines.join("\n"), blockCount };
}

mkdirSync("public/images", { recursive: true });
cpSync(`${repo}/icons`, "public/icons", { recursive: true });
for (const name of ["how-it-works.png", "install-flow.png"]) {
  cpSync(`${repo}/docs/images/${name}`, `public/images/${name}`);
}

const panel = runBlocksOnTheirOwnPage(readFileSync(`${repo}/design/ux-proposals.js`, "utf8"));
writeFileSync("public/panel.js", panel.text);
cpSync(`${repo}/design/ux-proposals.css`, "public/panel.css");
console.log(`Copied the icons, two pictures and the panel mock, with ${panel.blockCount} design blocks.`);

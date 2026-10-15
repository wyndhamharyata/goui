// Copies the icons, the pictures and the design's panel into public/. The design mounts only the hosts a page has.
import { cpSync, mkdirSync } from "node:fs";

const repo = "..";

mkdirSync("public/images", { recursive: true });
cpSync(`${repo}/icons`, "public/icons", { recursive: true });

for (const name of ["how-it-works.png", "install-flow.png", "mac-panel.jpg", "mac-wide.jpg"]) {
  cpSync(`${repo}/docs/images/${name}`, `public/images/${name}`);
}

cpSync(`${repo}/design/ux-proposals.js`, "public/panel.js");
cpSync(`${repo}/design/ux-proposals.css`, "public/panel.css");
console.log("Copied the icons, four pictures and the design's panel.");

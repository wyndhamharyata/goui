// Builds the zip that the Releases page offers. The zip holds one folder, so a person who unzips it
// gets a folder to point Chrome at, with manifest.json at the top of that folder.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";

const { version } = JSON.parse(readFileSync("manifest.json", "utf8"));
const staging = "dist/goui";
const zipName = `goui-${version}.zip`;

rmSync("dist", { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
// The licence and the notices travel with the extension, as the MIT licence asks.
for (const path of ["manifest.json", "src", "icons", "LICENSE", "THIRD_PARTY_NOTICES.md"]) cpSync(path, `${staging}/${path}`, { recursive: true });
execFileSync("zip", ["-r", "-q", zipName, "goui"], { cwd: "dist" });
console.log(`dist/${zipName}`);

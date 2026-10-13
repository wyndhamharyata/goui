// Builds the two zips for a release. The Releases page offers the folder one, which a person unzips
// to get a folder for Chrome. The store takes the flat one, which has manifest.json at its root.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("manifest.json", "utf8"));
const staging = "dist/goui";
const releaseZip = `goui-${version}.zip`;
const storeZip = `goui-${version}-store.zip`;
const contents = ["src", "icons", "LICENSE", "THIRD_PARTY_NOTICES.md"];

rmSync("dist", { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
// The licence and the notices travel with the extension, as the MIT licence asks.
for (const path of contents) cpSync(path, `${staging}/${path}`, { recursive: true });

// The store hands out the key on the first upload, so neither zip ships a key of its own. The repo
// manifest keeps one, so the tests know the extension id before the browser starts.
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
delete manifest.key;
writeFileSync(`${staging}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

execFileSync("zip", ["-r", "-q", releaseZip, "goui"], { cwd: "dist" });
// The store wants the manifest at the root of the zip, with no folder around it.
execFileSync("zip", ["-r", "-q", `../${storeZip}`, ...contents, "manifest.json"], { cwd: staging });

console.log(`dist/${releaseZip} for the Releases page, one goui folder inside`);
console.log(`dist/${storeZip} for the Chrome Web Store, manifest at the root`);

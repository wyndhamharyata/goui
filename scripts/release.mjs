// npm run release -- patch --notes notes.md raises the version, makes every file again, publishes and deploys.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const steps = ["patch", "minor", "major"];

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} [cwd]
 */
function run(command, args, cwd = ".") {
  console.log(`\n> ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {string}
 */
function readOutput(command, args) {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

/**
 * @param {string} path
 * @returns {string}
 */
function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** @param {string} message */
function fail(message) {
  console.error(`\nNo release: ${message}`);
  process.exit(1);
}

function toNextVersion(current, step) {
  if (/^\d+\.\d+\.\d+$/.test(step)) return step;

  const [major, minor, patch] = current.split(".").map(Number);

  if (step === "major") return `${major + 1}.0.0`;
  // The patch counts to nine, so the minor takes the step at ten and a version stays short.
  if (step === "minor" || patch >= 9) return `${major}.${minor + 1}.0`;

  return `${major}.${minor}.${patch + 1}`;
}

const [step = ""] = process.argv.slice(2);
const notesFlag = process.argv.indexOf("--notes");
const notesPath = notesFlag > 0 ? process.argv[notesFlag + 1] : "";
const manifestText = readFileSync("manifest.json", "utf8");
const current = JSON.parse(manifestText).version;
const version = toNextVersion(current, step);
const tag = `v${version}`;

if (!steps.includes(step) && !/^\d+\.\d+\.\d+$/.test(step)) fail("give a step: patch, minor, major or a version such as 0.2.0.");
if (!notesPath || !existsSync(notesPath) || readFileSync(notesPath, "utf8").trim() === "") fail("give the release notes with --notes path/to/notes.md.");
if (readOutput("git", ["branch", "--show-current"]) !== "main") fail("check out main first.");
if (readOutput("git", ["status", "--porcelain"]) !== "") fail("commit or put away the changes first, so the release commit holds only made files.");
if (readOutput("git", ["tag", "--list", tag]) !== "") fail(`${tag} is already tagged.`);

console.log(`Releasing ${current} -> ${version}.`);
writeFileSync("manifest.json", manifestText.replace(`"version": "${current}"`, `"version": "${version}"`));

// The made files that name the version or show the panel.
run("npm", ["run", "readme-images"]);
run("npm", ["run", "store-images"]);
run("npm", ["run", "dependencies-file"]);
run("npm", ["run", "lint"]);
run("npm", ["test"]);

run("git", ["add", "-A"]);
run("git", ["commit", "-q", "-m", `Move to ${version}\n\nThe install pictures, the store images and the dependency list are made again for it.`]);
run("git", ["push", "origin", "main"]);

run("npm", ["run", "zip"]);
run("sh", ["App/make-tarball.sh"], "mac/engine");

const plist = execFileSync("tar", ["-xzOf", "mac/engine/.build/goui-mac.tar.gz", "goui.app/Contents/Info.plist"]);
const appVersion = execFileSync("plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", "-"], { input: plist, encoding: "utf8" }).trim();

if (appVersion !== version) fail(`the Mac tarball says ${appVersion}, not ${version}. Nothing is published yet.`);

// The Mac app checks the tarball against this file before it installs anything.
const zipPath = `dist/goui-${version}.zip`;
const tarballPath = "mac/engine/.build/goui-mac.tar.gz";
const checksumsPath = `dist/goui-${version}-sha256.txt`;

writeFileSync(checksumsPath, `${sha256(tarballPath)}  goui-mac.tar.gz\n${sha256(zipPath)}  goui-${version}.zip\n`);

run("gh", ["release", "create", tag, zipPath, tarballPath, checksumsPath, "--target", "main", "--title", `goui ${tag}`, "--notes-file", notesPath]);
run("npm", ["run", "deploy:prod"], "site");

console.log(`\ngoui ${version} is released, and the site is deployed.`);
console.log(`For the Chrome Web Store, upload dist/goui-${version}-store.zip when you choose, with the text in store/listing.md.`);

// Builds DEPENDENCIES.md from the installed packages. Each one is a tool for lint, test or build.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const direct = new Set(Object.keys(JSON.parse(readFileSync("package.json", "utf8")).devDependencies || {}));

function readLicense(manifest) {
  if (manifest.license) return String(manifest.license);
  if (Array.isArray(manifest.licenses)) return manifest.licenses.map((entry) => entry.type).join(" OR ");

  return "not stated";
}

function installedPackages() {
  const found = [];
  for (const entry of readdirSync("node_modules")) {
    if (entry.startsWith(".")) continue;

    const names = entry.startsWith("@")
      ? readdirSync(join("node_modules", entry)).map((name) => `${entry}/${name}`)
      : [entry];
    for (const name of names) {
      const file = join("node_modules", name, "package.json");
      if (!existsSync(file)) continue;

      const manifest = JSON.parse(readFileSync(file, "utf8"));
      found.push({ name, version: manifest.version, license: readLicense(manifest) });
    }
  }

  return found.sort((left, right) => left.name.localeCompare(right.name));
}

const lines = [
  "# Dependencies",
  "",
  "This file is built by `npm run dependencies-file`. Every package below is a development tool for lint,",
  "test or build. None of them travel in the extension. The release zip holds the manifest, the src",
  "and icons folders, the licence and the third party notices, and nothing else.",
  "",
  "A direct dependency is one named in `package.json`. The rest arrive with those.",
  "",
  "| Package | Version | Licence | Direct |",
  "| --- | --- | --- | --- |",
];

const packages = installedPackages();
for (const { name, version, license } of packages) {
  lines.push(`| \`${name}\` | ${version} | ${license} | ${direct.has(name) ? "yes" : ""} |`);
}

writeFileSync("DEPENDENCIES.md", `${lines.join("\n")}\n`);
console.log(`DEPENDENCIES.md, ${packages.length} packages.`);

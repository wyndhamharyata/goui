import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { tokenize } from "espree";

/** @typedef {{ text: string, kind: string, line: number }} Piece */

const bannedWords = new Set([
  "absent", "adds", "bail", "bailed", "bailing", "bails", "clearing", "critically", "freeze",
  "freezes", "frozen", "gap", "gaps", "gate", "gated", "gates", "gating", "guard", "guarded",
  "guarding", "guards", "honest", "invariant", "invariants", "landed", "landing", "lands",
  "leaves", "leaving", "minted", "noop", "outrank", "outranks", "seam", "seams", "shape",
  "shaped", "shapes", "shaping", "significantly", "sits", "sitting", "spike", "spikes",
  "surface", "surfaces", "survive", "survived", "survives", "surviving",
]);

const bannedPhrases = [
  "call site", "call sites", "carries the weight", "earns its place", "fall through",
  "falls through", "heart of the change", "holds the contract", "key insight", "load bearing",
  "make no mistake", "no op", "read better", "reads better", "this is important",
];

// Only the words that read as generated text in a name. A noun such as "gap" is fine in code.
const bannedNames = new Set([
  "absent", "bail", "bailed", "bailing", "bails", "gate", "gated", "gates", "gating",
  "guard", "guarded", "guarding", "guards", "invariant", "invariants", "minted", "outrank",
  "outranks", "seam", "seams", "shape", "shaped", "shapes", "shaping", "spike", "spikes",
  "surface", "surfaces",
]);

const causalWords = new Set(["because", "hence", "therefore"]);
// site/public holds copies that the site's npm run assets makes, so only the originals are read.
const skippedPaths = new Set([join("site", "public")]);
const skippedFolders = new Set([".build", ".git", ".sst", ".wrangler", "dist", "node_modules", "playwright-report", "test-results"]);
// The generated files are machine output, and this file lists the banned words themselves.
const skippedFiles = new Set([
  "DEPENDENCIES.md",
  "package-lock.json",
  join("scripts", "check-words.mjs"),
]);

/**
 * @param {string} source
 * @param {string} kind
 * @returns {Piece[]}
 */
function splitLines(source, kind) {
  return source.split("\n").map((text, index) => ({ text, kind, line: index + 1 }));
}

/**
 * @param {string} source
 * @returns {Piece[]}
 */
function readScript(source) {
  const tokens = tokenize(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    comment: true,
    loc: true,
  });
  const kinds = { Identifier: "name", String: "text", Template: "text" };
  const pieces = tokens
    .filter((token) => kinds[token.type])
    .map((token) => ({ text: token.value, kind: kinds[token.type], line: token.loc.start.line }));

  for (const comment of tokens.comments) {
    pieces.push({ text: comment.value, kind: "comment", line: comment.loc.start.line });
  }

  return pieces.concat(findLongComments(tokens.comments), findCrowdedReturns(source));
}

// A function of more than three lines keeps a blank line above its last return.
/**
 * @param {string} source
 * @returns {Piece[]}
 */
function findCrowdedReturns(source) {
  const lines = source.split("\n");
  const pieces = [];
  let start = -1;
  lines.forEach((text, index) => {
    const isStart = /^(export )?(async )?function /.test(text) && text.endsWith("{");
    if (isStart) start = index;
    const isEnd = text === "}" && start >= 0;
    if (!isEnd) return;

    const bodyLength = index - start - 1;
    const isCrowded = bodyLength > 3 && lines[index - 1].startsWith("  return") && lines[index - 2].trim() !== "";
    if (isCrowded) pieces.push({ text: "", kind: "crowdedReturn", line: index });
    start = -1;
  });

  return pieces;
}

// Rule 3 keeps a comment to one line. A second line comment right under the first breaks it.
/**
 * @param {{ type: string, loc: { start: { line: number } } }[]} comments
 * @returns {Piece[]}
 */
function findLongComments(comments) {
  const lines = new Set(comments.filter((comment) => comment.type === "Line").map((comment) => comment.loc.start.line));
  return [...lines].filter((line) => lines.has(line - 1)).map((line) => ({ text: "", kind: "longComment", line }));
}

// Splitting on every backtick also blanks fenced blocks, since a fence has an odd count of them.
function blankCode(markdown) {
  return markdown
    .split("`")
    .map((part, index) => (index % 2 === 0 ? part : "\n".repeat(part.split("\n").length - 1)))
    .join(" ");
}

// CSS is read with the name list only. Its own words, such as the gap property, are not prose.
const readers = {
  ".css": (source) => splitLines(source, "name"),
  ".html": (source) => splitLines(source, "text"),
  ".js": readScript,
  ".json": (source) => splitLines(source, "text"),
  ".md": (source) => splitLines(blankCode(source), "doc"),
  ".mjs": readScript,
};

function findPunctuationProblems(text, kind) {
  const problems = [];
  if (kind !== "name" && (text.includes("\u2014") || text.includes("\u2013"))) problems.push("em or en dash");
  if ((kind === "doc" || kind === "comment") && text.includes(";")) problems.push("semicolon");

  return problems;
}

function findProblems(text, kind) {
  if (kind === "longComment") return ["comment runs over one line"];
  if (kind === "crowdedReturn") return ["no blank line above the last return"];
  const words = text.replaceAll(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z]+/);
  const spaced = ` ${words.join(" ")} `;
  const problems = [];

  for (const word of words) {
    const isBanned = kind === "name" ? bannedNames.has(word) : bannedWords.has(word);
    if (isBanned) problems.push(`"${word}"`);
    if (kind === "doc" && causalWords.has(word)) problems.push(`"${word}" between two facts`);
  }

  for (const phrase of bannedPhrases) {
    if (spaced.includes(` ${phrase} `)) problems.push(`"${phrase}"`);
  }
  if (/ worth [a-z]+ing /.test(spaced)) problems.push(`"worth ...ing"`);

  return problems.concat(findPunctuationProblems(text, kind));
}

/**
 * @param {string} folder
 * @returns {string[]}
 */
function listFiles(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (!entry.isDirectory()) return [path];
    if (skippedFolders.has(entry.name) || skippedPaths.has(path)) return [];
    return listFiles(path);
  });
}

let problemCount = 0;

for (const path of listFiles(".")) {
  const read = readers[extname(path)];
  if (!read || skippedFiles.has(path)) continue;

  for (const piece of read(readFileSync(path, "utf8"))) {
    for (const problem of findProblems(piece.text, piece.kind)) {
      console.log(`${path}:${piece.line} ${problem}`);
      problemCount += 1;
    }
  }
}

if (problemCount > 0) {
  console.log(`${problemCount} problems. CLAUDE.md rules 2, 3 and 6 explain each one.`);
  process.exit(1);
}

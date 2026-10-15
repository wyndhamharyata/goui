import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { tokenize } from "espree";
import { findLayoutProblems, layoutMessages } from "./layout-rules.mjs";

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
// design/ holds throwaway mocks. ESLint skips them too, so only their words are checked.
const layoutSkippedFolder = "design";
// site/public holds copies that the site's npm run assets makes, so only the originals are read.
const skippedPaths = new Set([join("site", "public")]);
const skippedFolders = new Set([".build", ".git", ".sst", ".wrangler", "dist", "node_modules", "playwright-report", "test-results"]);
// The generated files are machine output, and this file lists the banned words themselves.
const skippedFiles = new Set([
  "DEPENDENCIES.md",
  "package-lock.json",
  join("scripts", "check-rules.mjs"),
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

  return pieces;
}

// A Swift keyword is the language's own word, so the name list skips it.
const swiftKeywords = new Set([
  "actor", "any", "as", "associatedtype", "async", "await", "borrowing", "break", "case", "catch",
  "class", "consuming", "continue", "convenience", "default", "defer", "deinit", "didSet", "do",
  "dynamic", "each", "else", "enum", "extension", "fallthrough", "false", "fileprivate", "final",
  "for", "func", "get", "guard", "if", "import", "in", "indirect", "infix", "init", "inout",
  "internal", "is", "isolated", "lazy", "let", "macro", "mutating", "nil", "nonisolated", "open",
  "operator", "optional", "override", "package", "postfix", "prefix", "private", "protocol",
  "public", "repeat", "required", "rethrows", "return", "self", "sending", "set", "some", "static",
  "struct", "subscript", "super", "switch", "throw", "throws", "true", "try", "typealias",
  "unowned", "var", "weak", "where", "while", "willSet",
]);

// Swift has no parser here. Code goes to the name list, a string to the text list and a comment to
// the comment list. Rule 3 keeps a comment to one line, and two comments in a row break it.
/**
 * @param {string} source
 * @returns {Piece[]}
 */
function readSwift(source) {
  const pieces = [];
  const commentLines = new Set();
  let index = 0;
  let line = 1;

  while (index < source.length) {
    const character = source[index];

    if (character === "\n") { line += 1; index += 1; continue; }
    if (isCommentStart(source, index)) {
      const comment = readSwiftComment(source, index, line);
      pieces.push({ text: comment.text, kind: "comment", line });
      if (comment.isLine) commentLines.add(line);
      line = comment.line;
      index = comment.stop;
      continue;
    }
    if (character === '"') {
      const literal = readSwiftString(source, index, line);
      pieces.push({ text: literal.text, kind: "text", line });
      line = literal.line;
      index = literal.stop;
      continue;
    }
    if (/[A-Za-z_]/.test(character)) {
      const end = swiftWordEnd(source, index);
      const word = source.slice(index, end);
      if (!swiftKeywords.has(word)) pieces.push({ text: word, kind: "name", line });
      index = end;
      continue;
    }
    index += 1;
  }

  return pieces.concat(findSwiftLongComments(commentLines));
}

/**
 * @param {string} source
 * @param {number} index
 * @returns {boolean}
 */
function isCommentStart(source, index) {
  const next = source[index + 1];

  return source[index] === "/" && (next === "/" || next === "*");
}

/**
 * @param {string} source
 * @param {number} start
 * @param {number} line
 * @returns {{ text: string, stop: number, line: number, isLine: boolean }}
 */
function readSwiftComment(source, start, line) {
  const isLine = source[start + 1] === "/";
  const end = isLine ? source.indexOf("\n", start) : source.indexOf("*/", start + 2);
  const stop = end === -1 ? source.length : end + (isLine ? 0 : 2);
  const text = source.slice(start + 2, end === -1 ? source.length : end);

  return { text, stop, line: line + text.split("\n").length - 1, isLine };
}

/**
 * @param {string} source
 * @param {number} start
 * @returns {number}
 */
function swiftWordEnd(source, start) {
  let index = start + 1;

  while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1;

  return index;
}

/**
 * @param {Set<number>} commentLines
 * @returns {Piece[]}
 */
function findSwiftLongComments(commentLines) {
  const pieces = [];

  for (const line of commentLines) {
    if (commentLines.has(line - 1)) pieces.push({ text: "", kind: "longComment", line });
  }

  return pieces;
}

/**
 * @param {string} source
 * @param {number} start
 * @param {number} line
 * @returns {{ text: string, stop: number, line: number }}
 */
function readSwiftString(source, start, line) {
  let index = start + 1;
  let text = "";
  let currentLine = line;

  while (index < source.length) {
    const character = source[index];
    if (character === "\\") { text += source[index + 1] ?? ""; index += 2; continue; }
    if (character === '"') { index += 1; break; }
    if (character === "\n") currentLine += 1;
    text += character;
    index += 1;
  }

  return { text, stop: index, line: currentLine };
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
  ".swift": readSwift,
};

function findPunctuationProblems(text, kind) {
  const problems = [];
  if (kind !== "name" && (text.includes("\u2014") || text.includes("\u2013"))) problems.push("em or en dash");
  if ((kind === "doc" || kind === "comment") && text.includes(";")) problems.push("semicolon");

  return problems;
}

function findProblems(text, kind) {
  if (layoutMessages[kind]) return [layoutMessages[kind]];
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

  const source = readFileSync(path, "utf8");
  const pieces = read(source);
  const hasLayoutRules = (path.endsWith(".js") || path.endsWith(".mjs")) && !path.startsWith(layoutSkippedFolder);
  if (hasLayoutRules) pieces.push(...findLayoutProblems(source));

  for (const piece of pieces) {
    for (const problem of findProblems(piece.text, piece.kind)) {
      console.log(`${path}:${piece.line} ${problem}`);
      problemCount += 1;
    }
  }
}

if (problemCount > 0) {
  console.log(`${problemCount} problems. CLAUDE.md rules 2, 3, 6 and 10 explain each one.`);
  process.exit(1);
}

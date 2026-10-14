// The layout rules of CLAUDE.md that a syntax tree can check: comment length, blank lines and JSDoc.
import { parse } from "espree";

/** @typedef {{ text: string, kind: string, line: number }} Piece */

/** @typedef {{ name: string, depth: number, isExported: boolean, hasJsdoc: boolean, hasTypes: boolean, line: number }} FunctionFacts */

const exitTypes = new Set(["ReturnStatement", "ContinueStatement", "BreakStatement", "ThrowStatement"]);
const functionTypes = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
const controlTypes = new Set([
  "IfStatement", "ForStatement", "ForOfStatement", "ForInStatement", "WhileStatement", "DoWhileStatement", "SwitchStatement", "TryStatement",
]);

export const layoutMessages = {
  longComment: "comment runs over one line",
  crowdedReturn: "no blank line above the last return",
  crowdedExit: "no blank line after an early exit",
  crowdedControl: "no blank line around a control statement",
  crowdedUse: "no blank line between a run of declarations and the statements around it",
  nestedJsdoc: "JSDoc on a function inside a function",
  lonelyJsdoc: "JSDoc on a function with one caller in its own file",
  missingJsdoc: "no JSDoc on a function with two or more callers",
  repeatedInner: "a function inside a function is used twice, so it goes to the top level",
};

/**
 * @param {object} node
 * @returns {boolean}
 */
function isFunction(node) {
  return Boolean(node) && functionTypes.has(node.type);
}

/**
 * @param {object} node
 * @returns {boolean}
 */
function ends(node) {
  if (exitTypes.has(node.type)) return true;

  return node.type === "BlockStatement" && node.body.length > 0 && ends(node.body.at(-1));
}

/**
 * @param {object} node
 * @returns {boolean}
 */
function isEarlyExit(node) {
  return node.type === "IfStatement" && !node.alternate && ends(node.consequent);
}

// A function has types to give when it takes a parameter or returns a value.
/**
 * @param {object} node
 * @returns {boolean}
 */
function hasTypes(node) {
  if (node.params.length > 0) return true;
  if (node.body.type !== "BlockStatement") return true;

  let returnsValue = false;

  walk(node.body, (child, parents) => {
    const isOwnReturn = child.type === "ReturnStatement" && child.argument && !parents.some(isFunction);

    if (isOwnReturn) returnsValue = true;
  });

  return returnsValue;
}

/**
 * @param {object} node
 * @param {(node: object, parents: object[]) => void} visit
 * @param {object[]} [parents]
 */
function walk(node, visit, parents = []) {
  visit(node, parents);

  const children = Object.values(node).flat().filter((child) => child && typeof child.type === "string");

  for (const child of children) walk(child, visit, [...parents, node]);
}

// Rule 3 keeps a comment to one line. A second line comment right under the first breaks it.
function findLongComments(comments) {
  const lines = new Set(comments.filter((comment) => comment.type === "Line").map((comment) => comment.loc.start.line));

  return [...lines].filter((line) => lines.has(line - 1)).map((line) => ({ text: "", kind: "longComment", line }));
}

// Rule 6 keeps a blank line above the last return of a function of more than three statements.
function findCrowdedReturn(body, lines) {
  const statements = body.body;
  const last = statements.at(-1);
  const isLong = statements.length > 3 || (last && last.loc.start.line - body.loc.start.line > 3);
  const isCrowded = isLong && last.type === "ReturnStatement" && lines[last.loc.start.line - 2].trim() !== "";

  return isCrowded ? [{ text: "", kind: "crowdedReturn", line: last.loc.start.line }] : [];
}

/**
 * @param {object} node
 * @returns {boolean}
 */
function isControl(node) {
  return controlTypes.has(node.type);
}

/**
 * @param {object} node
 * @returns {boolean}
 */
function isOneLineIf(node) {
  return node.type === "IfStatement" && !node.alternate && node.loc.start.line === node.loc.end.line;
}

/**
 * @param {object} node
 * @returns {boolean}
 */
function isDeclaration(node) {
  return node.type === "VariableDeclaration";
}

// Two statements stand apart when a blank line follows the one above.
function isApart(above, below, lines) {
  return below.loc.start.line - above.loc.end.line > 1 && lines[above.loc.end.line].trim() === "";
}

// Rule 6. Control statements, runs of exits or one-line ifs, and runs of declarations are each their own block.
/**
 * @param {object[]} statements
 * @param {string[]} lines
 * @returns {Piece[]}
 */
function findCrowdedStatements(statements, lines) {
  const pieces = [];

  statements.forEach((statement, index) => {
    const next = statements[index + 1];

    if (!next || isApart(statement, next, lines)) return;

    const isExitRun = isEarlyExit(statement) && isEarlyExit(next);
    const isShortIfRun = isOneLineIf(statement) && isOneLineIf(next);

    if (isExitRun || isShortIfRun) return;

    const line = statement.loc.end.line;

    if (isEarlyExit(statement)) pieces.push({ text: "", kind: "crowdedExit", line });
    else if (isControl(statement) || isControl(next)) pieces.push({ text: "", kind: "crowdedControl", line });
    else if (isDeclaration(statement) !== isDeclaration(next) && next.type !== "ReturnStatement") pieces.push({ text: "", kind: "crowdedUse", line });
  });

  return pieces;
}

function listFunctions(source, ast) {
  const jsdocEnds = ast.comments
    .filter((comment) => comment.type === "Block" && comment.value.startsWith("*") && !/@typedef|@type\b/.test(comment.value))
    .map((comment) => comment.range[1]);
  const functions = [];

  walk(ast, (node, parents) => {
    const isNamedArrow = node.type === "VariableDeclarator" && isFunction(node.init);

    if (!isNamedArrow && node.type !== "FunctionDeclaration") return;

    const parent = parents.at(-1);
    const statement = isNamedArrow ? parent : node;
    const outer = parents.at(isNamedArrow ? -2 : -1);
    const start = outer && outer.type === "ExportNamedDeclaration" ? outer.range[0] : statement.range[0];
    // Line comments may sit between a JSDoc block and its function.
    const hasJsdoc = jsdocEnds.some((end) => end <= start && /^(\s*\/\/[^\n]*)*\s*$/.test(source.slice(end, start)));
    const depth = parents.filter(isFunction).length;
    const isExported = Boolean(outer) && outer.type === "ExportNamedDeclaration";

    functions.push({ name: node.id.name, depth, isExported, hasJsdoc, hasTypes: hasTypes(isNamedArrow ? node.init : node), line: node.loc.start.line });
  });

  return functions;
}

// Rule 10. A top-level function used in another file or in two places has JSDoc. No other function has it.
function findJsdocProblems(functions, referenceCounts) {
  const pieces = [];

  for (const facts of functions) {
    const callerCount = (referenceCounts.get(facts.name) || 0) - 1;
    const isUsedElsewhere = facts.isExported || callerCount >= 2;

    if (facts.depth > 0 && facts.hasJsdoc) pieces.push({ text: "", kind: "nestedJsdoc", line: facts.line });
    if (facts.depth > 0 && callerCount >= 2) pieces.push({ text: "", kind: "repeatedInner", line: facts.line });
    if (facts.depth === 0 && facts.hasJsdoc && !isUsedElsewhere) pieces.push({ text: "", kind: "lonelyJsdoc", line: facts.line });
    if (facts.depth === 0 && !facts.hasJsdoc && facts.hasTypes && callerCount >= 2) pieces.push({ text: "", kind: "missingJsdoc", line: facts.line });
  }

  return pieces;
}

/**
 * @param {string} source
 * @returns {Piece[]}
 */
export function findLayoutProblems(source) {
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module", comment: true, loc: true, range: true });
  const lines = source.split("\n");
  const referenceCounts = new Map();
  const pieces = findLongComments(ast.comments);

  walk(ast, (node, parents) => {
    if (node.type === "Identifier") referenceCounts.set(node.name, (referenceCounts.get(node.name) || 0) + 1);

    if (Array.isArray(node.body)) pieces.push(...findCrowdedStatements(node.body, lines));

    if (node.type === "SwitchCase") pieces.push(...findCrowdedStatements(node.consequent, lines));

    const isFunctionBody = node.type === "BlockStatement" && isFunction(parents.at(-1));

    if (isFunctionBody) pieces.push(...findCrowdedReturn(node, lines));
  });

  return pieces.concat(findJsdocProblems(listFunctions(source, ast), referenceCounts));
}

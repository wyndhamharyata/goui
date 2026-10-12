# goui

A Brave and Chromium extension that runs a tab's audio through a parametric EQ. You edit the EQ
in the side panel by dragging points on the curve, the way eqbyear.com works. The extension reads
and writes AutoEQ `ParametricEQ.txt` files. It can search the AutoEQ headphone list on GitHub.

## Stack

- Manifest V3, plain JavaScript, no build step. Load the folder with "Load unpacked".
- `chrome.tabCapture` takes the tab's audio. An offscreen document runs the Web Audio chain and
  plays the result. Chrome allows the capture only after a click on the toolbar icon, so the icon is
  the on and off switch and the panel has no Start button.
- The side panel has three tabs: Listen, Tune and Library. From 900 px wide they show as three
  columns. `design/ux-proposals.html` holds the mock the panel follows.
- `src/graph.js` draws the curve as SVG. It uses the same Web Audio filters the engine plays, so
  the picture matches the sound.
- `engineConfig` in `src/shared/filters.js` turns a stored config into what the engine plays: the bands
  of every layer that is on, the three Listen sliders as fixed bands, and the auto preamp. A config
  holds a `headphone` layer and an optional `ear` layer, each with its own switch and bands. Bands sum
  in dB, so the two layers merge exactly. `flatBands` is the same list for the whole-sound export.
- Each layer has its own preset list, under `headphonePresets` and `earPresets`. A preset holds bands
  only. The sliders and the preamp stay as they are when you pick one. A sound saved before the two
  lists splits into a headphone preset and, when it holds ear bands, an ear preset under that name.
- Playwright runs the tests at side panel width. ESLint and `scripts/check-words.mjs` run the lint.

## Commands

| Command        | What it does                                                         |
| -------------- | -------------------------------------------------------------------- |
| `npm run lint` | ESLint, then the word check in `scripts/check-words.mjs`.            |
| `npm test`     | Playwright journeys in Chromium with the extension loaded.           |

# Rules

These rules govern every change. When a rule makes the code worse, keep the better code and give
the reason in the commit message. Never drop a rule silently.

## 1. Write for the reader.

Judge code by how long another person needs to understand it. A short line that needs a second
read is worse than a longer line that does not. A reader holds about four things in mind at once.
Keep each block within that.

This rule settles every tie between the rules below.

## 2. Use plain words.

This covers docs, commit messages, comments, UI text and identifiers. `npm run lint` checks the
words it can. A person checks the rest.

1. Never use these words or their other forms: `bail`, `absent`, `clearing`, `no-op`,
   `falls through`, `survives`, `lands`, `landed`, `leaves`, `read better`, `invariant`, `gap`,
   `sits` (for placement), `minted`, `guard`, `adds`, `call site`, `gate`, `cut` (for a branch),
   `shape`, `spike`, and the opener `Worth ...ing?`.
2. Never use these metaphors: `load-bearing`, `frozen`, `seam`, `surface` (as a noun),
   `carries the weight`, `outranks`, `the heart of the change`, `honest` or `lie` (about code),
   `earns its place`, `holds the contract`.
3. No em dashes, no en dashes and no semicolons in prose. Never write a short label, then a colon,
   then its explanation. A colon only opens a list or an example.
4. No words that claim weight instead of stating a fact: `critically`, `significantly`,
   `the key insight`, `this is important`, `make no mistake`.
5. In docs and commit messages, never join two facts with `because`, `therefore` or `hence`.
   Write two plain sentences.
6. One fact per sentence. Never join two facts with a comma and `and`, as in "I did X, and Y
   happened". Write two sentences.
7. Name a thing by what it does: `isMissing`, never `isAbsent`. `isSiteEnabled`, never `siteGate`.
8. Read each sentence aloud. If a person explaining the thing to a teammate would not say it that
   way, write it again.

"Add" as a button label or an action name, such as "Add band" and `addBand`, is allowed.

## 3. A comment says what a name cannot.

The default is no comment. Write one line only when it holds one of these:

- The reason the code does something a reader would not expect.
- The source of a formula, with the source's own symbol: `// w0 = 2*pi*f0/Fs, RBJ Audio EQ Cookbook`.
- The unit of a bare number, when a name cannot hold it.

Never write a banner, an ALL-CAPS label, step narration such as `// Step 1`, a label such as
`// Main logic`, prose inside a JSDoc block, commented-out code, or a TODO with no named task. A
JSDoc block holds types only (rule 10).
If a line needs a comment to say what it does, rename it or split it.

## 4. A name is a full word.

- Write full words. `errorCount`, never `nErr`. A long name is fine.
- A boolean reads as a question: `isCapturing`, `hasPreset`, `shouldRamp`.
- A function is an action and its subject: `startCapture`, `parseAutoEq`, `drawCurve`.
- Use `min` and `max` for limits. Use `first` and `last` for a range that includes both ends.
- One thing has one name everywhere. The code, the storage and the UI all say "band". The word
  "Filter" appears only in the code that reads and writes AutoEQ text, where the file uses it.

## 5. A number carries its unit.

- Put the unit in the name: `sampleRateHz`, `frequencyHz`, `gainDb`, `gainLinear`, `omegaRad`,
  `rampSeconds`. `q` has no unit and stays `q`.
- A unit mismatch then looks wrong on sight: `gainDb = gainLinear`.
- Give a number a local name when a reader cannot tell what it is from its line.
  `10 ** (gainDb / 20)` needs no name. `setTargetAtTime(gainLinear, now, 0.02)` does, as
  `const rampSeconds = 0.02` on the line above.
- Put parentheses around mixed operators when the order is not obvious.

## 6. Structure

- Return early. The main path comes last. Keep each `if` one level deep where you can.
- Check a value once, where it enters: a storage read, an AutoEQ file, a message from another
  Chrome context, a field the user typed in. Code past that point trusts the value.
- A blank line groups a block. One idea per block, about five statements.
- Name a compound condition before you test it: `const canDrag = isCapturing && !isLocked`.
- A ternary fits on one line. Never nest one.
- Build a list with `if` and `push`. Never `[a && x, b && y].filter(Boolean)`.
- Name a lookup table above the line that indexes it.
- Keep a function under 15 branch points. Count `if`, `else if`, `for`, `while`, `case`, `catch`,
  a ternary, `&&`, `||` and `??`.
- Use `startsWith`, `indexOf`, `slice` and `split` before regex. AutoEQ lines split on spaces.

## 7. Functions, constants and files

- When two or more places do the same work, pull it into one function. Two copies drift apart.
- A one-line body counts when two copies could disagree, such as a formula, a selector or a rule
  about when something is off. A plain call with a new name does not count.
- Write a named constant or a shared object type when two or more places use it.
- Before you write a new file or helper, ask one question. If you deleted it and put its code back
  where it is used, would the code be harder to follow? If not, do not write it.
- Each Chrome context gets its own file: the side panel, the offscreen document, the service worker
  and the how-to page (`src/intro.html`). Code that two contexts both need goes in one shared file.
  `src/shared/messages.js` names the messages between contexts. `src/base.css` holds the palette of
  both pages. `src/guide.css` draws the pictures of the browser toolbar for both the guide and the
  panel.

## 8. Tests are user journeys.

1. There are no unit tests.
2. Each test is one user journey. It starts in the side panel and ends with the sound that comes
   out, in one run. No test checks one module or one layer on its own.
3. Mock nothing. The one exception is a third-party service we do not control. For goui that is
   GitHub, for the headphone search. A local server stands in for it and serves real AutoEQ files
   copied from the AutoEQ repo.
4. Never write a flag, a branch or a hook in `src/` only for a test.
5. Assert what the user hears or reads, such as a level in dB at a frequency, the value in a band
   field, or the text of an exported file. Never assert a CSS class.
6. Assert a number a person asked for. A file with a +6 dB peak at 1 kHz must make a 1 kHz tone
   6 dB louder than the same tone with the EQ off.
7. An error case is a step inside the journey it belongs to.
8. A test name states the situation and the result: `given an AutoEQ file with a 1 kHz peak, a
   1 kHz tone plays 6 dB louder`.
9. Before you keep an assertion, break `src/` on purpose and watch the test fail.

## 9. Scope of a change

- Touch only what the task needs. Match the style already in the file. Do not tidy nearby code.
- Fewer lines wins a tie. A named value that saves the reader time stays, even when it costs a line.
- Run the formatter only on the files you changed.

## 10. JSDoc gives types and nothing else.

- A function gets a JSDoc block when two or more places use it, or when another file imports it.
- A function also gets one when it passes data to a higher layer: a message to another Chrome
  context, the reply to one, a hook the graph calls in the panel, or a fetch.
- The block holds one `@param {Type} name` for each parameter. It holds `@returns {Type}` when the
  function returns a value. An async function returns `Promise<Type>`. A function with no
  parameter and no return value needs no block.
- A hook object or a lookup table of functions that another layer calls takes one `@type` line.
- No prose in the block. No description after a name. The reason for the code stays in a `//`
  comment above the block (rule 3).
- A type that two or more places use is a `@typedef` in the file that owns it.
  `src/shared/filters.js` owns the band, layer and config types. Another file names them as
  `import("./shared/filters.js").Band`.
- `npm run lint` checks that every export has a block, that each type parses and is known, and that
  no block holds prose. A person checks the functions with two callers.

## Differences from the global rules

- Comments allow a formula source and a unit note, as well as a reason (rule 3).
- JSDoc holds types for shared functions, with no prose (rule 10).
- Two places doing the same work are enough for a helper (rule 7).
- A number with an unclear meaning gets a local name (rule 5).
- Deep modules and the 15-branch limit replace the push for small functions (rules 6 and 7).
- Fewer lines is a tie-breaker, not a target (rule 9).
- Unit tests are banned (rule 8).

## Accepted exceptions

Each one names the rule it breaks and the reason.

- The render and event functions in `src/panel.js` and `src/graph.js` have one caller each,
  against rule 7. Folded into their callers, those callers would pass the 15-branch limit. Their
  names are also what a reader scans the file for.
- Each word list at the top of `scripts/check-words.mjs` has one reader, against rule 7.
  The lists are data. A person edits them there, next to each other, when rule 2 changes.

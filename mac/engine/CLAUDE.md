# The Mac engine

The rules in the repo root `CLAUDE.md` govern this Swift code too. This page explains how each rule applies to Swift.

## What the lint checks

`scripts/check-rules.mjs` reads every `.swift` file and sorts it into names, comments and strings.

- A comment gets the rule 2 word list, the em dash ban and the semicolon ban.
- A string gets the rule 2 word list and the em dash ban.
- A name gets the shorter rule 2 list for identifiers, such as `shape`. Swift keywords like `guard` and `let` are skipped.
- Rule 3. Two `//` lines in a row report "comment runs over one line".

The lint has no Swift parser, so a person checks rules 1 and 6.

## Rules 1, 2 and 3

The default is no comment. Write one line only for an unexpected reason, a formula source, or a unit a name cannot hold.

A Core Audio status code is a reason to write one. `// Core Audio calls the handler on the main queue.`

## Rule 4

- A boolean reads as a question. `isRunningInstalledApp`, `hasShadow`, `canBecomeKey`.
- A function is a verb and its subject. `buildPanel`, `readMeters`, `sendStatus`.
- The verb table in the root `CLAUDE.md` applies. `build` makes something not on screen yet, `read` reads a value, `to` converts a value, and `is` and `has` answer a question.
- Write full words. `callbacksPerSecond`, never `cbs`.

## Rule 5

Put the unit in the name. `sampleRateHz`, `frequencyHz`, `gainDb`, `retryDelaysSeconds`, `fadeWaitSeconds`, `panelSize`, `gapPx`. `q` has no unit and stays `q`.

Give a bare number a local name when its line does not make it clear. `let nanosecondsPerSecond = 1_000_000_000.0`.

Put parentheses around mixed operators when the order is not obvious.

## Rule 6

- Return early. The main path comes last.
- Put a blank line between declarations and the statements that use them. Put a blank line around a `do`/`catch` or a multi-line `if`.
- Name a compound condition before you test it. `let isMenuClick = event?.type == .rightMouseUp || …`.
- One idea per block, about five statements.
- A function of more than three lines keeps a blank line above its last `return`.
- Keep a function under 15 branch points.

## Rule 7

Two places doing the same work share one function. The `Teardown` list is the one place that takes down an audio path. `Band.on` has no default, so every call states whether the band plays.

## Rule 10

Swift has static types. Do not restate parameters or return types in a doc comment. Use a single-line `//` comment for reasons only (rule 3).

## Tests

`goui-render-check` plays tones through the C render code and checks each gain and fade. The user journeys of rule 8 live in the Playwright tests at the repo root.

## Both languages

One thing has one name across `src/`, `mac/web/` and Swift. `Band`, `Sound`, `preampDb` and the layer names in `src/shared/config.js` mean the same in both.

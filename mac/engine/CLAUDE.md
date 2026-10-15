# The Mac engine

The rules in the repo root `CLAUDE.md` govern this Swift code too. This page says how each rule reads for Swift.

## What the lint checks

`scripts/check-rules.mjs` reads every `.swift` file, as it reads the JavaScript. It sorts each file into names, comments and strings.

- A comment gets the rule 2 word list, the em dash ban and the semicolon ban.
- A string gets the rule 2 word list and the em dash ban.
- A name gets the shorter rule 2 list that suits a name, such as `shape`. A Swift keyword is the language's own word, so `guard` and `let` are left out.
- Rule 3. Two `//` lines in a row report "comment runs over one line".

The lint cannot read structure, since no Swift parser is here. A person checks rules 1 and 6.

## Rules 1, 2 and 3

The default is no comment. A comment gives a reason a reader would not expect, a formula source, or a unit a name cannot hold. One line only.

A Core Audio status code is a reason to write one. `// Core Audio calls the handler on the main queue.`

## Rule 4

- A boolean reads as a question. `isRunningInstalledApp`, `hasShadow`, `canBecomeKey`.
- A function is a verb and its subject. `buildPanel`, `readMeters`, `sendStatus`.
- The verb table in the root `CLAUDE.md` holds. `build` makes something that is not there yet, `read` reads a value, `to` converts one value into another, `is` and `has` answer a question.
- Full words. `callbacksPerSecond`, never `cbs`.

## Rule 5

Put the unit in the name. `sampleRateHz`, `frequencyHz`, `gainDb`, `retryDelaysSeconds`, `fadeWaitSeconds`, `panelSize`, `gapPx`. `q` has no unit and stays `q`.

Give a bare number a local name when a reader cannot tell what it is from the line. `let nanosecondsPerSecond = 1_000_000_000.0`.

Put parentheses around mixed operators when the order is not obvious.

## Rule 6

- Return early. The main path comes last.
- A blank line stands between a run of declarations and the statements that use it. Another stands around a `do`/`catch` or an `if` of more than one line.
- Name a compound condition before you test it. `let isMenuClick = event?.type == .rightMouseUp || …`.
- One idea per block, about five statements.
- A function of more than three lines keeps a blank line above its last `return`.
- Keep a function under 15 branch points.

## Rule 7

Two places doing the same work share one function. The `Teardown` list is the one place that takes an audio path down. `Band.on` has no default, so every call says whether the band plays.

## Rule 10

Swift has real types, so the type says the type. Do not restate a parameter or a return in a doc comment. A plain `//` comment holds a reason only, as rule 3 says.

## Tests

`goui-render-check` plays tones through the C render code and checks each gain and each fade. It is the one test on this side. The user journeys of rule 8 live in the Playwright tests at the repo root.

## Both languages

One thing has one name across `src/`, `mac/web/` and the Swift. `Band`, `Sound`, `preampDb` and the layer names in `src/shared/config.js` mean the same in both.

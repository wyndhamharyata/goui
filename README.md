# goui

An EQ for one browser tab, or for the whole Mac. It tunes the sound to your headphone, then to your
ear, then to your taste.

## Install

> The pictures here show the panel on `main`. An install today gets release 0.1.7, which has the
> older blue look and no Sets yet.

### Chrome and Brave

<a href="https://chromewebstore.google.com/detail/goui/ghldfngciehgonecnnihpdeghejkndap"><img src="docs/images/chrome-web-store.png" alt="Available in the Chrome Web Store" height="58"></a>

One click installs it. Chrome keeps it up to date. To load the files yourself instead, see
[Add the extension by hand](#add-the-extension-by-hand).

### Mac

Paste this in Terminal:

```sh
curl -fsSL https://raw.githubusercontent.com/wyndhamharyata/goui/main/mac/install.sh | sh
```

Needs Apple silicon and macOS 26 or later. Read [goui for the Mac](#goui-for-the-mac) first.

## Contents

- [Install](#install)
- [What it does](#what-it-does)
- [Add the extension by hand](#add-the-extension-by-hand)
- [The icon is the switch](#the-icon-is-the-switch)
- [goui for the Mac](#goui-for-the-mac)
- [Use it](#use-it): [Listen](#listen), [Tune](#tune), [Library](#library) and [Sets](#sets)
- [Measure your ear](#measure-your-ear)
- [Notes](#notes)
- [Credits](#credits)
- [Develop](#develop)

## What it does

goui combines AutoEQ and EQByEar. AutoEQ corrects the headphone or IEM you use. An EQByEar test
then tunes to your own hearing. Your taste goes on top, as bands of your own.

goui runs the sound of one browser tab through a parametric EQ. goui for the Mac does the same for
every sound on the Mac. Both keep the headphone, your ear and your taste as three layers, each with
its own switch. Bass, Vocals and Treble adjust the sound on top of all three. The bands and sliders
add up in dB. A Set restores all three layers and the sliders at once.

![The sound of a tab passes the headphone layer, then the ear layer, then the taste layer, then reaches you. Bass, Vocals and Treble nudge the sound on top of all three layers.](docs/images/how-it-works.png)

## Add the extension by hand

To run the files yourself instead of the Chrome Web Store, add goui by hand once. Download a zip,
unzip it, and point Chrome at the folder.

![Install goui in four steps: download the zip, load the folder, pin goui, click the icon.](docs/images/install-flow.png)

### 1. Download the zip

![The Releases page, with the zip and a Download button.](docs/images/install-download.png)

Open the [Releases page](https://github.com/wyndhamharyata/goui/releases/latest). Under the newest
release, press the zip whose name starts with **goui-**. The numbers after it are the version.
Unzip it. Double-clicking the file is enough.

Keep the folder in place. Chrome reads it from there on every start. Moving or deleting it turns
goui off.

### 2. Load the folder in Chrome

![The extensions page with Developer mode on and its Load unpacked button.](docs/images/install-load-unpacked.png)

Open `chrome://extensions` in Chrome, or `brave://extensions` in Brave. Turn on **Developer mode**
at the top right. Press **Load unpacked**.

![Pick the folder that holds manifest.json.](docs/images/install-pick-folder.png)

Pick the goui folder, the one with `manifest.json`. A file inside it will not load.

### 3. Pin goui

![Press the pin beside goui in the extensions menu.](docs/images/install-pin.png)

Click the puzzle piece in the toolbar and pin goui. The icon stays in the toolbar.

### 4. Start listening

![Click the goui icon on a page with sound. The panel opens and the icon shows a green ON.](docs/images/install-click-icon.png)

Open a page with audio and click the goui icon on it. The side panel opens.

A how-to guide opens in a tab on first install. The **?** button opens it again. It covers each
step, Sets, and how to measure your ear. Until goui hears its first tab, the panel shows the first
three steps in place of the EQ.

## The icon is the switch

Chrome lets an extension capture a tab's audio only after you click its icon on that tab.

- With the panel open, click the icon on the current tab to turn goui off. With the panel closed,
  the same click reopens the panel.
- Click the icon on another tab to move goui there.
- Installed apps (like YT Music) have no side panel. The icon opens goui as a popup with its own
  power button.
- The icon shows a green ON badge on the active tab.
- Closing the tab turns goui off.

## goui for the Mac

The Mac app runs every sound on the Mac through the same panel, from the menu bar. Needs Apple
silicon and macOS 26 or later. The install line is under [Install](#mac).

The installer checks the Mac and asks before installing. No admin password needed. It puts goui in
`~/Applications`, starts it at login, then opens the panel. macOS asks to let goui record audio the
first time. Press **Allow**. goui EQs the sound on its way out and keeps none of it.

- Click the menu bar item to open and close the panel. Right-click for **About goui**,
  **Restart engine**, **Reload panel**, **Wide panel**, **Sets**, update items and **Quit goui**.
- **Sets** lists saved Sets and ticks the active one. Pick a Set to load it with the panel closed.
- goui follows the default output. Another system EQ (eqMac, SoundSource) stacks its curve on
  goui's. Run one at a time.
- Spatial Audio and head tracking on AirPods and Beats stop while goui plays.
- goui is not signed by Apple yet. An engine update asks for the audio permission again. Settings
  stay in `~/Library/Application Support/goui`.
- goui updates itself. A panel-only release applies quietly. An engine release shows **Update to …**
  in the menu.
- goui checks GitHub for new releases twice a day. It sends nothing about you.
- The `goui` command in Terminal takes `start`, `stop`, `restart`, `set "name"`, `logs`, `rollback`
  and `uninstall`.

[goui.mwyndham.dev/mac](https://goui.mwyndham.dev/mac) has more, with troubleshooting.

## Use it

The panel is the same in the browser and on the Mac. The header shows the title of the tab goui
hears, or what to do when it hears nothing. Hold **A/B** to hear the sound without the EQ. The
switch turns the EQ on or off. The level shows the output in dB. Its light turns red when the EQ
may clip.

### Listen

- The **Set** picker loads a saved Set. **Save as Set** saves the current sound as a Set.
  [Sets](#sets) has more.
- Below are the **Headphone**, **My ear** and **Taste** layers. Each row has its own switch.
  **Change** opens that layer in the Library. The headphone **x** plays it flat. The ear and taste
  **x** removes that layer. Layers not yet added show an add button.
- A headphone from AutoEQ shows its **Target**. Pick another to retune. The list shows only targets
  for the rig that measured your headphone. Changing the target reloads the headphone and discards
  band edits.
- Bass, Vocals and Treble adjust the sound on top of all three layers. They persist across preset
  changes.
- The preamp follows the largest boost to prevent clipping. Move the slider to set it manually.
  Press **Auto** to return to automatic.
- **Level match** holds the preamp during A/B. The EQ usually plays quieter than the raw sound.
  With both sides at the same preamp, the comparison is about the curve, not the volume.

### Tune

- Drag a point to change frequency and gain. A click selects it. The point moves after 5 px of drag.
  Hold Shift for fine steps.
- On a selected peak, pull the side handles for a wider band, or scroll on the point.
- Double-click empty space to add a band. It joins the selected band's layer, or the headphone layer
  if nothing is selected.
- Chips come in three rows, one per layer. Each row has an **Add band** chip. **Add band** in the
  Taste row starts the Taste layer.
- On the graph, ear points have a gold ring and taste points a pink one. Each layer draws its own
  dashed curve under the solid total.
- Click a chip to select that band. Click again to deselect.
- All, Lows, Mids and Highs zoom the graph. **Tall** rotates it.
- The inspector under the chips edits the selected band. Type buttons: Peak, Low shelf, High shelf,
  Low cut, High cut. **More** shows the rarer types.
- The **-** and **+** steppers move frequency by a semitone and gain by 0.5 dB. On Q they change the
  bandwidth. You can also type values directly.
- **On** toggles the band. **Solo** plays it alone. **Delete** removes it.
- **Number table** lists every band with type, frequency, gain and Q.

### Library

The Library has a tab for each layer and one for Sets. Step 1 is headphone, step 2 is ear (tuned to
your hearing on top of the headphone), step 3 is taste. Each layer tab has its own presets, Save,
Import, Paste and Export.

- **Save** keeps the current bands as a preset. An AutoEQ pick fills in the name. After an edit the
  button reads **Save changes**. **Save as new** saves under another name.
- The list shows saved presets. The active one is marked. Pick one to load it. **x** deletes it.
- In the headphone tab, the search box finds your presets, starter sounds and AutoEQ headphones. Pick
  a result to load it.
- One headphone often has several measurements. The subtitle gives source, form, rig and target.
  **AutoEQ's pick** marks the recommended one.
- **Import** loads a `ParametricEQ.txt` file. **Paste** opens a text box. **Export** writes that
  layer as AutoEQ text.
- **Measure my ear with EQByEar** is in the ear tab. [Measure your ear](#measure-your-ear) has the
  steps.
- The ear list ends with **No ear tuning**. The taste list ends with **No taste**. Each removes its
  layer.
- **Export the whole sound** writes all three layers and sliders as one AutoEQ file.

At 900 px or wider, Listen, Tune and Library show side by side. The Mac's **Wide panel** opens at
1100 px.

### Sets

A Set names one headphone preset, one ear preset and one taste preset, plus Bass, Vocals and Treble.
One press loads all of it.

- Pick a Set in the **Set** picker on Listen, or in the **Sets** tab of the Library. The picker
  shows the active Set name.
- **Save as Set** saves the three layers and sliders under a name. Each layer with bands must be
  saved as a preset first.
- To update a Set, save under the same name. The button reads **Replace**.
- **x** on a row in the Sets tab deletes that Set. Its presets remain.
- An empty ear or taste slot turns that layer off. An empty headphone slot plays Flat.
- Sets reference presets by name. Editing a preset updates every Set that uses it.
- A deleted preset shows as missing. The Set still loads, with that slot empty.
- On the Mac, the **Sets** menu and `goui set "name"` also load Sets.

## Measure your ear

An AutoEQ profile corrects the headphone, not your ear. An EQByEar test measures what your ear
still needs. goui keeps the two apart.

1. In the Library, open the My ear tab and press **Measure my ear with EQByEar**. The ear layer
   turns off so the test hears only the headphone.
2. EQByEar opens in a new tab. In the browser, click the goui icon on that tab first, then run the
   test. On the Mac, goui already hears the browser, so run the test straight away.
3. Copy the result. Press **Paste** in the My ear tab, paste it, then press **Apply**.
4. Press **Save** to keep it as an ear preset. Turn the ear layer on to hear headphone plus ear.

## Notes

- Chrome warns about developer mode extensions on some starts. Keep them enabled. The warning is
  Chrome's, not a sign of a problem.
- Web Audio shelf filters take no Q. An AutoEQ shelf keeps its frequency and gain but drops Q. The
  inspector notes this on shelves.
- The AutoEQ search reads the public index on GitHub. Results are cached for a week.
- Targets come from AutoEQ. AutoEQ tunes a headphone to the first target of its rig. Another target
  puts in bands that shift the sound from that target to the one you pick, up to 12 kHz.
- The extension only changes audio inside the browser. For the whole Mac, use goui for the Mac.

## Credits

goui builds on other people's work. `THIRD_PARTY_NOTICES.md` has the full notices.

- **AutoEQ** by Jaakko Pasanen. Headphone profiles, search index and target curves. MIT licence.
- **EQByEar** at [eqbyear.com](https://eqbyear.com). The ear test goui opens in a new tab.
- **Google Material Icons**. Panel and guide icons. Apache 2.0 licence.
- **Atkinson Hyperlegible Next and Mono** by the Braille Institute. Panel, guide and site text. SIL Open Font licence.
- goui itself is MIT licensed. See `LICENSE`.

Build and test tools are npm packages. None ship in the extension. `DEPENDENCIES.md` lists them.

## Develop

No build step. The extension is plain JavaScript. A file change is live after pressing reload on the
extensions page.

Clone the repo to work on the code:

```bash
git clone https://github.com/wyndhamharyata/goui.git
cd goui
npm install
npx playwright install chromium
```

| Command                     | What it does                                                         |
| --------------------------- | -------------------------------------------------------------------- |
| `npm run lint`              | ESLint, then the word and layout checks.                             |
| `npm test`                  | The browser journeys.                                                |
| `npm run icons`             | Rebuild the icon files.                                              |
| `npm run readme-images`     | Rebuild the pictures in `docs/images`.                               |
| `npm run store-images`      | Rebuild the Chrome Web Store screenshots and tiles in `store/`.      |
| `npm run targets`           | Rebuild `src/targets.json` from AutoEQ's target curves.              |
| `npm run dependencies-file` | Rebuild `DEPENDENCIES.md` from the installed packages.               |
| `npm run zip`               | Build the release zip and the Chrome Web Store zip.                  |
| `npm run mac`               | Build the Mac app and install it on this Mac.                        |
| `npm run release`           | Cut a release, from the version to the deployed site.                |

`npm run readme-images` and `npm run store-images` convert SVG to PNG with `rsvg-convert`. On a Mac,
`brew install librsvg`. `npm run store-images` also needs ImageMagick's `convert`.

`scripts/make-readme-images.mjs` draws the pictures in `docs/images` using `src/base.css` colours.
Each is written as SVG and PNG. A release regenerates them, so changes go in the script.

`scripts/make-extension-zip.mjs` builds the release zip: `manifest.json`, `src`, `icons`, licence
and notices inside one `goui` folder. Unzip and point Chrome at it.

`npm run zip` also writes `dist/goui-<version>-store.zip`, with `manifest.json` at its root, for the
Chrome Web Store.

Write release notes to a file, then run one command from a clean `main`:

```bash
npm run release -- patch --notes notes.md
```

The step is `patch`, `minor`, `major` or an exact version like `0.2.0`. The script bumps `version`
in `manifest.json`, regenerates images and `DEPENDENCIES.md`, runs lint and journeys, then commits
and pushes. It builds `dist/goui-<version>.zip`, the store zip and the Mac tarball, writes
`dist/goui-<version>-sha256.txt`, publishes the GitHub release with the zip, tarball and hashes,
then deploys the site.

The Mac app updates from that release. It reads `goui-mac.tar.gz` and the `-sha256.txt` beside it.
Keep those names and the `vX.Y.Z` tag format.

The Chrome Web Store upload is manual. The script prints which zip to upload.
`store/listing.md` has the listing text.

The Mac app lives in `mac/`. `mac/engine/README.md` covers its engine and how to build it.
`mac/PLAN.md` records how it came together.

The homepage at [goui.mwyndham.dev](https://goui.mwyndham.dev) lives in `site/`, with its own
packages. `site/README.md` covers how to run and deploy it.

Tests open the panel as a normal tab and fire the icon's click event in the service worker, since
Playwright cannot press the toolbar icon. A launch flag lets that click capture.

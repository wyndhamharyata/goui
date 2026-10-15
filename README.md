# goui

An EQ for one browser tab, or for the whole Mac. It tunes the sound to your headphone, then to your
ear, then to your taste. It all comes down to one mantra: **different ear, different head, different
sound.**

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

It needs a Mac with Apple silicon and macOS 26 or newer. Read
[goui for the Mac](#goui-for-the-mac) first, for what the installer does and what to expect.

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

goui joins two audio tools, AutoEQ and EQByEar. AutoEQ gives you a neutral baseline for the
headphone or IEM you use. An EQByEar test then tunes that baseline to how your own ear hears it. Your
taste goes on top, as bands of your own.

goui runs the sound of one browser tab through a parametric EQ. goui for the Mac does the same for
every sound the Mac plays. Both keep the headphone, your ear and your taste apart, as three layers.
Each layer has its own switch. Bass, Vocals and Treble nudge the sound on top of all three. The bands
of every layer and the sliders add up in dB, so the merge is exact. A Set brings all three layers and
the sliders back in one press.

![The sound of a tab passes the headphone layer, then the ear layer, then the taste layer, then reaches you. Bass, Vocals and Treble nudge the sound on top of all three layers.](docs/images/how-it-works.png)

## Add the extension by hand

To run the files yourself instead of the Chrome Web Store, add goui by hand one time. It takes about
two minutes. You download a zip, unzip it, then point Chrome at the folder.

![Install goui in four steps: download the zip, load the folder, pin goui, click the icon.](docs/images/install-flow.png)

### 1. Download the zip

![The Releases page, with the zip and a Download button.](docs/images/install-download.png)

Open the [Releases page](https://github.com/wyndhamharyata/goui/releases/latest). Under the newest
release, press the zip file whose name starts with **goui-**. The numbers after it are the version.
Unzip it after the download. Double clicking the file is enough.

Keep the unzipped folder where it is. Chrome reads it from there on every start. A move or a delete
turns goui off.

### 2. Load the folder in Chrome

![The extensions page with Developer mode on and its Load unpacked button.](docs/images/install-load-unpacked.png)

Open `chrome://extensions` in Chrome, or `brave://extensions` in Brave. Turn on **Developer mode**
at the top right. Press **Load unpacked**.

![Pick the folder that holds manifest.json.](docs/images/install-pick-folder.png)

The button asks for a folder. Pick the goui folder, the one that holds `manifest.json`. A file
inside it will not load.

### 3. Pin goui

![Press the pin beside goui in the extensions menu.](docs/images/install-pin.png)

Click the puzzle piece in the toolbar. Press the pin beside goui. The goui icon then stays in the
toolbar, one click away.

### 4. Start listening

![Click the goui icon on a page with sound. The panel opens and the icon shows a green ON.](docs/images/install-click-icon.png)

Open a page that plays audio and click the goui icon on it. The side panel opens. goui starts
hearing that page.

A how-to guide opens in a tab once, on the first install. The **?** button in the panel opens it
again. It shows each step with a picture of what to press. It also covers Sets and how to measure
your ear. Until goui hears its first tab, the panel itself shows the first three steps in place of
the EQ.

## The icon is the switch

Chrome lets an extension take a tab's audio only after you click its icon on that tab. So the panel
has no Start button.

- With the panel open, click the icon on the tab goui hears to turn goui off. With the panel
  closed, the same click only opens the panel again.
- Click the icon on another tab to move goui there.
- An installed app, such as YT Music, has no side panel. There the icon opens goui as a popup, with
  its own power button.
- The icon shows a green ON badge on the tab goui hears.
- Closing that tab turns goui off.

## goui for the Mac

The Mac app runs every sound the Mac plays through the same panel, from the menu bar. It needs a Mac
with Apple silicon and macOS 26 or newer. The install line is under [Install](#mac).

The installer checks your Mac and asks before it installs. It needs no admin password. It puts goui
in `~/Applications`, starts it at login, then opens the panel under the menu bar item. The first
time, macOS asks to let goui record the audio of this Mac. Press **Allow**. goui changes the sound
on its way to you and keeps none of it.

- Click the menu bar item to open and close the panel. Right-click it for **About goui**,
  **Restart engine**, **Reload panel**, **Wide panel**, **Sets**, the update items and **Quit goui**.
- **Sets** lists your Sets and ticks the one that plays. A pick plays it with the panel closed. The
  submenu shows once you have saved a Set.
- goui follows the Mac's default output. Another system EQ, such as eqMac or SoundSource, stacks its
  curve on goui's. Run one at a time.
- Spatial Audio and head tracking on AirPods and Beats drop out while goui plays.
- goui is not signed by Apple yet. An update of the engine asks for that permission again. Your
  settings stay in `~/Library/Application Support/goui`.
- goui keeps itself up to date. A release that changes only the panel goes in quietly. A release
  that changes the engine shows an **Update to …** item in the menu. One click installs it. Run the
  install line again if you want to.
- goui asks GitHub for the newest version twice a day. It sends nothing about you.
- The `goui` command in Terminal takes `start`, `stop`, `restart`, `set "name"`, `logs`, `rollback`
  and `uninstall`. `goui set "name"` plays one of your Sets, as a pick from the Sets menu does.

[goui.mwyndham.dev/mac](https://goui.mwyndham.dev/mac) has more, with troubleshooting.

## Use it

The panel is the same in the browser and on the Mac. The header is on every tab. It shows the title
of the tab goui hears, or what to click when goui hears nothing. Hold **A/B** to hear the sound
without the EQ. The switch turns the EQ on or off. The level is the output in dB. Its light turns
red when the EQ can clip.

### Listen

- The **Set** picker at the top plays one of your Sets. **Save as Set** beside it keeps the sound
  you hear as a Set. [Sets](#sets) has more.
- The stack below holds a **Headphone** layer, a **My ear** layer and a **Taste** layer. Each row
  has its own switch. AutoEQ alone against AutoEQ plus your ear is then one press. **Change** opens
  that layer in the Library. The headphone row's **×** plays it flat. The ear and taste rows' **×**
  takes that layer off. A layer you have not added shows a button to add it.
- A headphone from AutoEQ shows its **Target**, the sound AutoEQ tunes it toward. Pick another one to
  hear the headphone tuned to it. The list holds only the targets made for the rig that measured your
  headphone. A change of target loads the headphone again. Edits to its bands are then lost.
- Bass, Vocals and Treble nudge the sound on top of all three layers. They stay when you pick another
  preset.
- The preamp follows the largest boost, so the sound never clips. Move the slider to set it by hand.
  Press **Auto** to give it back.
- **Level match** keeps the preamp while you hold A/B. The EQ usually plays quieter than the raw
  sound. People tend to prefer the louder side. With both sides at the same preamp, the comparison is
  about the curve, not the volume.

### Tune

- Drag a point to change that band's frequency and gain. A press alone only selects it. The point
  moves once you drag it 5 px. Hold Shift for fine steps.
- On a selected peak, pull the square side handles apart for a wider band, or scroll on the point.
- Double click empty space to make a new band. It joins the layer of the band you have selected, or
  the headphone layer when nothing is selected.
- The chips come in three rows, one for each layer. Each row has its own **Add band** chip. The
  chips wrap onto more lines as a layer gains bands. **Add band** in the Taste row starts the Taste
  layer.
- On the graph, ear points carry a gold ring and taste points a pink one. Each layer draws its own
  dashed curve under the solid total.
- Press a chip to tune that band. A second press on the same chip selects no band.
- All, Lows, Mids and Highs zoom the graph. **Tall** turns it, with low notes at the top.
- The inspector under the chips edits the selected band. The type buttons pick Peak, Low shelf, High
  shelf, Low cut or High cut. **More** holds the rarer types.
- The **−** and **+** steppers move the frequency by a semitone and the gain by 0.5 dB. On Q they
  make the band wider or narrower. You can also type each number.
- **On** turns the band on or off. **Solo** plays that band alone. **Delete** takes it out.
- **Number table** under the inspector lists every band with its type, frequency, gain and Q.

### Library

The Library has a tab for each layer and one for the Sets. Step 1 is your headphone. Step 2 is your
ear, which tunes the sound to your own hearing on top of the headphone. Step 3 is your taste, your
own bands on top of both. Each layer tab has its own list of presets and its own Save, Import, Paste
and Export.

- **Save** keeps the bands you hear as a preset under a name. An AutoEQ pick fills in the headphone
  name, so one press keeps it. After an edit the button reads **Save changes**. **Save as new** keeps
  a second preset under another name.
- The list shows the presets you saved. The one that plays now is marked. A pick from the list plays
  it again. The **×** on a row deletes it.
- In the headphone tab, the search box finds your headphone presets, the starter sounds and the
  AutoEQ headphones. A pick from a search plays it. The box then empties and Listen shows the sound.
- One headphone often has several measurements. The line under each name gives the source, the form,
  the rig and the target AutoEQ tuned it to. **AutoEQ's pick** marks the one AutoEQ recommends.
- **Import** loads a `ParametricEQ.txt` file into that layer. **Paste** opens a box for the same text.
  Press **Apply** to load it. **Export** writes that one layer as AutoEQ text.
- **Measure my ear with EQByEar** is in the ear tab. [Measure your ear](#measure-your-ear) has each
  step.
- The ear list ends with **No ear tuning**. The taste list ends with **No taste**. Each takes its
  layer off.
- **Export the whole sound** under the tabs writes all three layers and the sliders as one AutoEQ
  file. A second press puts the text away.

On a panel 900 px or wider, Listen, Tune and Library show side by side. The Mac's **Wide panel**
opens at 1100 px, so it shows the same three columns.

### Sets

A Set names one headphone preset, one ear preset and one taste preset. It keeps Bass, Vocals and
Treble too. One press plays all of it.

- Pick a Set in the **Set** picker at the top of Listen, or in the **Sets** tab of the Library. The
  picker names the Set that plays, when one does.
- **Save as Set** keeps the three layers and the sliders under a name. It needs each layer with
  bands saved as a preset first. If a layer is not saved yet, goui names that layer and stops.
- To change a Set, save under its name. The button then reads **Replace**.
- The **×** on a row in the Sets tab deletes that Set. Its presets stay.
- An empty ear or taste slot turns that layer off. An empty headphone slot plays Flat.
- A Set points at its presets by name. An edit to a preset reaches every Set that names it.
- A deleted preset reads as missing in the Set's row. The Set still plays, with that slot empty.
- On the Mac, the menu bar item's **Sets** menu and `goui set "name"` play a Set too.

## Measure your ear

An AutoEQ profile corrects the headphone, not your ear. An EQByEar test measures what your ear still
wants. goui keeps the two apart.

1. In the Library, open the My ear tab and press **Measure my ear with EQByEar**. The ear layer turns
   off, so the test hears the headphone alone.
2. EQByEar opens in a new tab. In the browser, click the goui icon on that tab first, then run the
   test. On the Mac, goui already hears the browser, so run the test right away.
3. Copy the result and come back to goui. Press **Paste** in the My ear tab, paste the result in the
   box, then press **Apply**.
4. Press **Save** to keep it as an ear preset. Then turn the ear layer on to hear the headphone plus
   your ear.

## Notes

- Chrome warns about developer mode extensions on some starts. Choose the option that keeps them. The
  warning is Chrome's own. It does not mean goui is broken.
- The Web Audio shelf filters take no Q. An AutoEQ shelf keeps its corner frequency and gain and
  drops its Q. The inspector says so on a shelf.
- The AutoEQ search reads the public index on GitHub. The result is kept for a week, so a second
  search is fast.
- The targets come from AutoEQ itself. AutoEQ's file tunes a headphone to the first target of its
  rig. Another target puts in a few bands that move the sound from that target to the one you pick, up
  to 12 kHz.
- The extension can only change audio inside the browser. For the whole Mac, use goui for the Mac.

## Credits

goui stands on other people's work. `THIRD_PARTY_NOTICES.md` holds the full notices. The guide
inside the extension has the short version.

- **AutoEQ** by Jaakko Pasanen. The headphone profiles, the search index and the target curves come
  from AutoEQ. It is under the MIT licence.
- **EQByEar** at [eqbyear.com](https://eqbyear.com). The ear test, which goui opens in a new tab.
- **Google Material Icons**. The icons in the panel and the guide. They are under the Apache 2.0
  licence.
- goui itself is under the MIT licence. See `LICENSE`.

The tools that lint, test and build goui are npm packages. None of them ships in the extension.
`DEPENDENCIES.md` lists every one with its licence.

## Develop

There is no build step. The extension is plain JavaScript. A change to a file is live after you
press the reload button on the extensions page.

Clone the repo if you want to change the code:

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

`npm run readme-images` and `npm run store-images` turn SVG into PNG with `rsvg-convert`. On a Mac,
`brew install librsvg` installs it. `npm run store-images` also needs ImageMagick's `convert`.

The pictures in `docs/images` are drawn by `scripts/make-readme-images.mjs`, in the colours of
`src/base.css`. Each one is written as an SVG and as a PNG. A release draws them again, so a change
goes in the script. Run `npm run readme-images` to see it.

The release zip is built by `scripts/make-extension-zip.mjs`. It holds the `manifest.json`, the
`src` folder, the `icons` folder, the licence and the notices, all inside one `goui` folder. A person
who unzips it gets a folder to point Chrome at.

`npm run zip` also writes `dist/goui-<version>-store.zip`, with `manifest.json` at its root, for the
Chrome Web Store.

To cut a release, write its notes to a file, then run one command from a clean `main`:

```bash
npm run release -- patch --notes notes.md
```

The step is `patch`, `minor`, `major` or a version such as `0.2.0`. The script raises `version` in
`manifest.json`. Then it makes the install pictures, the store images and `DEPENDENCIES.md` again.
It runs lint and the journeys, then commits and pushes. It builds `dist/goui-<version>.zip`, the
store zip and the Mac tarball. It writes `dist/goui-<version>-sha256.txt`, the hashes of the zip and
the tarball. Then it publishes the GitHub release with the zip, the tarball and the hashes. Last, it
deploys the site. The curl line installs the tarball of the release GitHub marks as Latest.

The Mac app updates itself from that release. It reads `goui-mac.tar.gz` and the `-sha256.txt` file
beside it. It trusts a release only when its tag matches the version the app holds. Keep those names
and the `vX.Y.Z` tag when you change the release script.

The Chrome Web Store upload stays a hand step. The script prints which zip to upload.
`store/listing.md` holds the text to paste.

The Mac app lives in `mac/`. `mac/engine/README.md` covers its engine and how to build it.
`mac/PLAN.md` records how it came together.

The homepage at [goui.mwyndham.dev](https://goui.mwyndham.dev) lives in `site/`, with its own
packages. `site/README.md` covers how to run and deploy it.

The tests open the panel as a normal tab. They fire the icon's own click event in the service
worker, since Playwright cannot press the toolbar icon. A launch flag lets that click capture.

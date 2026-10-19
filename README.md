# goui

A parametric EQ for one browser tab or the whole Mac. It tunes audio to your headphone, then to
your ear, then to your taste.

## Install

> The screenshots show `main`. The Chrome Web Store currently has release 0.1.8, which uses the
> older blue icon and text.

### Chrome and Brave

<a href="https://chromewebstore.google.com/detail/goui/ghldfngciehgonecnnihpdeghejkndap"><img src="docs/images/chrome-web-store.png" alt="Available in the Chrome Web Store" height="58"></a>

One click installs it. Chrome keeps it updated. To load the unpacked folder instead, see
[Add the extension by hand](docs/install-by-hand.md).

### Mac

Paste this in Terminal:

```sh
curl -fsSL https://raw.githubusercontent.com/wyndhamharyata/goui/main/mac/install.sh | sh
```

Requires Apple silicon and macOS 26 or later. macOS asks to record system audio on first start.
Press **Allow**. goui processes audio in real time and keeps none of it. Spatial Audio on AirPods
and Beats pauses while goui is active. Read [goui for the Mac](docs/mac.md) before you install.

## What it does

goui combines AutoEQ and EQByEar. AutoEQ corrects your headphone or IEM. An EQByEar test tunes to
your hearing. Your taste goes on top as your own bands.

The browser extension runs one tab's audio through the EQ. The Mac app runs all system audio
through it. Both keep your headphone, ear and taste as three separate layers, each with its own
switch. Bass, Vocals and Treble adjust the sound across all three. A Set restores all three layers
and the sliders at once.

![The sound of a tab passes the headphone layer, then the ear layer, then the taste layer, then reaches you. Bass, Vocals and Treble nudge the sound on top of all three layers.](docs/images/how-it-works.png)

## Start

1. Open a tab playing audio and click the goui icon. The side panel opens. On the Mac, click the
   menu bar icon and press the power button.
2. In **Library > Headphone**, search for your headphone and pick it.
3. Optional. Press **Measure my ear** in **Library > My ear** to tune to your hearing.
4. Hold **A/B** to hear the difference.

Chrome captures a tab only after you click the icon on that tab. Click the icon on another tab to
move goui there. Press **?** in the panel for the built-in guide.

## More

- [Using goui](docs/using-goui.md) covers every control in Listen, Tune, Library and Sets.
- [goui for the Mac](docs/mac.md) covers the menu bar, updates and the `goui` command.
- [Develop](docs/develop.md) covers setup, scripts and releases.

## Credits

AutoEQ by Jaakko Pasanen (MIT). EQByEar at [eqbyear.com](https://eqbyear.com). Google Material
Icons (Apache 2.0). Atkinson Hyperlegible Next and Mono by the Braille Institute (SIL OFL 1.1).
Full texts are in `THIRD_PARTY_NOTICES.md`.

goui is MIT licensed. See `LICENSE`.

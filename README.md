# goui

A parametric equalizer for individual browser tabs or full system audio on macOS. It applies
corrections sequentially for your headphones, your individual hearing, and your personal tonal
preferences.

## Installation

**Chrome & Brave:** Install directly from the
[Web Store](https://chromewebstore.google.com/detail/goui/ghldfngciehgonecnnihpdeghejkndap) for
automatic updates. To load the extension manually, see
[Add the extension by hand](docs/install-by-hand.md).

<a href="https://chromewebstore.google.com/detail/goui/ghldfngciehgonecnnihpdeghejkndap"><img src="docs/images/chrome-web-store.png" alt="Available in the Chrome Web Store" height="58"></a>

**macOS:** Run the following installation script in Terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/wyndhamharyata/goui/main/mac/install.sh | sh
```

Requires Apple silicon and macOS 26 or later. macOS requests audio capture permissions on initial
launch to route system audio. Processing occurs in real time without writing audio data to disk.
Spatial Audio on AirPods and Beats devices is bypassed while active.

## Architecture & Features

goui integrates the AutoEQ database and the EQByEar measurement protocol:

- **Headphone Layer:** Uses AutoEQ target curves to correct frequency response for specific
  headphone models and IEMs.
- **My Ear Layer:** Applies a localized compensation curve generated from an in-app EQByEar
  measurement test.
- **Taste Layer:** Provides user-defined parametric EQ bands.
- **Master Controls:** Includes global Bass, Vocals, and Treble sliders that adjust across all
  three layers simultaneously.

The browser extension processes audio within a single tab context. The macOS application captures
and processes system-wide audio. Both implementations run all three layers independently with
dedicated bypass toggles and global preset management via Sets.

![The sound of a tab passes the headphone layer, then the ear layer, then the taste layer, then reaches you. Bass, Vocals and Treble nudge the sound on top of all three layers.](docs/images/how-it-works.png)

## Getting Started

1. Open a tab with active audio output and click the goui extension icon to launch the side panel.
   On macOS, click the menu bar icon and select power.
2. Navigate to **Library > Headphone** to search for and select your headphone correction profile.
3. (Optional) Run **Library > My ear > Measure my ear** to calibrate output to your frequency
   sensitivity.
4. Use the **A/B** toggle button to switch between raw and processed audio.

> [!NOTE]
> In Chrome, audio capture attaches to the active tab upon clicking the extension icon. Re-clicking
> on another tab transfers audio routing.

## Credits & Licensing

- **AutoEQ:** Created by Jaakko Pasanen (MIT License)
- **EQByEar:** Developed by [eqbyear.com](https://eqbyear.com)
- **Iconography:** Google Material Icons (Apache License 2.0)
- **Typography:** Atkinson Hyperlegible Next and Mono by the Braille Institute (SIL Open Font
  License 1.1)

Full third-party license texts are located in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
goui is open-source software under the [MIT License](LICENSE).

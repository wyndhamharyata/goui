# Chrome Web Store listing

Fields to paste into the developer dashboard. Assets are in this folder.

## Store listing tab

**Description** (up to 16,000 characters)

```
goui is a parametric EQ for a browser tab, tuned to your headphone and your hearing.

- Headphone: pick your model from AutoEQ for a neutral baseline.
- My ear: an EQByEar test measures what your ear still needs.
- Taste: your own bands, plus Bass, Vocals and Treble sliders.

Each layer has its own switch. Switching headphones keeps your ear tuning. Auto preamp offsets boosts to prevent clipping.

Drag points on the curve or type exact values. Save presets and Sets, or import, paste and export ParametricEQ.txt files.

Click the goui icon on any tab playing audio to start.

ALSO ON MAC
goui for the Mac runs all system audio through the same panel from the menu bar. Requires Apple silicon and macOS 26. See goui.mwyndham.dev/mac.

No personal data collected. Free and open source (MIT licence).
```

**Category**: Productivity.

**Language**: English.

**Store icon**: `store/icon-128.png` (128x128).

**Screenshots**:

- `store/screenshot-1-panel.png` (1280x800)
- `store/screenshot-2-tune.png` (1280x800)
- `store/screenshot-3-guide.png` (1280x800)

**Small promo tile**: `store/promo-small-440x280.png` (440x280).

**Marquee promo tile**: `store/promo-marquee-1400x560.png` (1400x560).

**Global promo video**: leave empty.

## Additional fields

**Official URL**: leave as None unless verified in Google Search Console.

**Homepage URL**: `https://goui.mwyndham.dev`

**Support URL**: `https://github.com/wyndhamharyata/goui/issues`

**Mature content**: off.

## Privacy tab

**Single purpose**

```
goui runs the audio of one browser tab through a parametric EQ, combining an AutoEQ headphone profile, an EQByEar hearing profile and custom taste bands.
```

**Permission justifications**

- `activeTab`: Reads the URL and title of the clicked tab to verify it is a web page and display its title.
- `tabCapture`: Captures audio from the clicked tab for EQ processing.
- `offscreen`: Runs the Web Audio graph in an offscreen document.
- `storage`: Stores presets, Sets, sliders and capture state locally on the device.
- `sidePanel`: Displays the EQ controls in the browser side panel.
- `https://raw.githubusercontent.com/jaakkopasanen/AutoEq/*`: Downloads the AutoEQ headphone index and selected headphone profiles.

**Remote code**: select "No, I am not using remote code." AutoEQ downloads are plain text files parsed as numbers.

**Data usage**: leave all data collection boxes unchecked. Check all three certifications at the bottom.

**Privacy policy URL**: `https://goui.mwyndham.dev/privacy`

## Distribution tab

- Free item.
- All regions.
- Public visibility.

## After the first upload

Copy the public key from the Package tab into the `key` field of `manifest.json` so local builds match the published extension ID. Run `npm run zip` before the next upload.

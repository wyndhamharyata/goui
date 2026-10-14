# Chrome Web Store listing

Everything to paste into the developer dashboard, field by field. The images are in this folder.

## Store listing tab

**Description** (the long description field, up to 16,000 characters)

```
goui is a browser level equaliser. It runs the audio of one tab through a parametric EQ, so your
headphone sounds the way you want on any site.

Most EQ tools stop at the headphone. goui joins two corrections that belong together:

1. Headphone. AutoEQ measures your headphone and writes a profile that cancels its colour, which
   gives a neutral baseline.
2. My ear. An EQByEar hearing test measures what your ear still wants on top of that baseline.

goui keeps the two apart, as two layers. The bands of both layers add up in dB, so the merge is
exact. Each layer has its own switch, so you can hear the AutoEQ baseline alone in one press, then
turn your ear tuning back on. A new headphone changes the headphone layer only, so your ear tuning
stays.

Bass, Vocals and Treble go on top as your taste. The preamp follows the largest boost, so the sound
never clips.

TUNE BY EAR OR BY NUMBER
- Drag a point on the graph to set a band's frequency and gain.
- Pull the side handles, or scroll on a point, to change how wide a band is.
- Double click empty space to make a new band.
- The inspector edits one band with exact numbers. Solo plays that band alone.
- All, Lows, Mids and Highs zoom the graph. Tall turns it so low notes run down the panel.

KEEP WHAT YOU LIKE
- Save a headphone preset and an ear preset under their own names.
- Search the AutoEQ headphones by model.
- Import or paste a ParametricEQ.txt file into either layer.
- Export one layer, or the whole sound, as an AutoEQ file for other apps.

HOW IT WORKS
- Click the goui icon on the tab you want to hear. The side panel opens and goui starts listening to
  that tab.
- Click the icon again to turn it off, or click it on another tab to move goui there.
- The icon shows a green ON badge on the tab goui hears.

goui changes audio inside the browser only. It collects no personal data, and nothing it reads goes
out of your browser apart from the AutoEQ downloads.

Free and open source, under the MIT licence.
```

**Category**: Productivity. The store has no audio or music category, and Productivity is the closest
one. Pick another if the dashboard offers a better fit.

**Language**: English.

**Store icon**: `store/icon-128.png` (128x128).

**Screenshots**: all three, in this order.

- `store/screenshot-1-panel.png` (1280x800)
- `store/screenshot-2-tune.png` (1280x800)
- `store/screenshot-3-guide.png` (1280x800)

**Small promo tile**: `store/promo-small-440x280.png` (440x280).

**Marquee promo tile**: `store/promo-marquee-1400x560.png` (1400x560). Optional, and only shown when
the store features the item.

**Global promo video**: leave empty. There is no video yet.

## Additional fields

**Official URL**: leave as None. It needs the site verified in Google Search Console first, which is
optional. To set it later, verify `mwyndham.dev` in Search Console, then pick it here.

**Homepage URL**: `https://goui.mwyndham.dev`

**Support URL**: `https://github.com/wyndhamharyata/goui/issues`

**Mature content**: off.

## Privacy tab

**Single purpose**

```
goui runs the audio of one browser tab through a parametric EQ. It joins an AutoEQ headphone profile
with an EQByEar ear-correction profile, keeps them as two layers, and adds Bass, Vocals and Treble on
top.
```

**Permission justifications**

- `activeTab`: Reads the address and the title of the tab whose icon you click, to check it is a web
  page and to show its title in the panel. goui reads no other tab.
- `tabCapture`: Takes the audio of the tab whose icon you click, so it can run through the EQ. Chrome
  grants this for that tab alone.
- `offscreen`: Runs the Web Audio graph in an offscreen document, since a service worker has no audio
  of its own.
- `storage`: Keeps your presets, your sliders and your settings on your device, and the current
  capture state for the session.
- `sidePanel`: Shows the EQ interface in the side panel.
- `https://raw.githubusercontent.com/jaakkopasanen/AutoEq/*`: Downloads the AutoEQ headphone list and
  the profile you pick. These are the only network requests goui makes.

**Remote code**: select "No, I am not using remote code." goui runs only the files in the package. It
downloads AutoEQ text, which it reads as numbers and never runs.

**Data usage**: tick no "collected" boxes. goui collects no user data. Then tick all three
certifications at the bottom of the section.

**Privacy policy URL**: `https://goui.mwyndham.dev/privacy`

## Distribution tab

- Not a paid item.
- All regions, or pick your own.
- Public visibility, or Private to trusted testers for a first look.

## After the first upload

The store hands out a public key. Copy it from the Package tab and replace the `key` field in
`manifest.json`, so a local dev build uses the same extension ID as the published one. Then run
`npm run zip` again for the next upload.

# Chrome Web Store listing

Everything to paste into the developer dashboard, field by field. The images are in this folder.

## Store listing tab

**Description** (the long description field, up to 16,000 characters)

```
goui is an equaliser for your browser. It runs the sound of one tab through a parametric EQ, tuned
to your headphone and to your own ear.

- Headphone: pick your model from AutoEQ for a neutral baseline.
- My ear: an EQByEar hearing test adds what your ear still wants.
- Bass, Vocals and Treble go on top as your taste.

The two layers stay apart, each with its own switch, so a new headphone keeps your ear tuning. The
preamp follows the largest boost, so the sound never clips.

Drag points on the graph or type exact numbers. Save presets, import or paste ParametricEQ.txt, and
export to other apps.

Click the goui icon on a tab to start. The side panel opens, and the icon shows a green ON.

ALSO ON THE MAC
goui for the Mac EQs every sound the Mac plays, from the menu bar, with the same panel. It needs
Apple silicon and macOS 26. Get it at goui.mwyndham.dev/mac.

goui collects no personal data. Free and open source, under the MIT licence.
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

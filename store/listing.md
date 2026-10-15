# Chrome Web Store listing

Everything to paste into the developer dashboard, field by field. The images are in this folder.

## Store listing tab

**Description** (the long description field, up to 16,000 characters)

```
goui is a parametric EQ for a browser tab, tuned to your headphone and your hearing.

- Headphone: pick your model from AutoEQ for a corrected baseline.
- My ear: an EQByEar test measures what your ear still wants.
- Taste: your own bands, with Bass, Vocals and Treble.

Three layers, each with its own switch. A new headphone keeps your ear tuning. The preamp follows
the largest boost to prevent clipping.

Drag points on the graph or type exact values. Save presets, import or paste ParametricEQ.txt,
export to other apps.

Click the goui icon on a tab to start. The side panel opens and the icon turns green.

ALSO ON THE MAC
goui for the Mac EQs every sound on the Mac, from the menu bar, with the same panel. Needs Apple
silicon and macOS 26. See goui.mwyndham.dev/mac.

No personal data collected. Free and open source, MIT licence.
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
goui runs the audio of one browser tab through a parametric EQ. It combines an AutoEQ headphone
profile with an EQByEar ear-correction profile in separate layers, plus a Taste layer of your own
bands, with Bass, Vocals and Treble.
```

**Permission justifications**

- `activeTab`: Reads the address and title of the clicked tab to check it is a web page and show its
  title. Reads no other tab.
- `tabCapture`: Captures the audio of the clicked tab for the EQ. Chrome grants this for that tab
  only.
- `offscreen`: Runs the Web Audio graph in an offscreen document. A service worker has no audio
  context.
- `storage`: Keeps presets, sliders and settings on your device, plus the capture state for the
  session.
- `sidePanel`: Shows the EQ in the side panel.
- `https://raw.githubusercontent.com/jaakkopasanen/AutoEq/*`: Downloads the AutoEQ headphone list and
  the profile you pick. The only network requests goui makes.

**Remote code**: select "No, I am not using remote code." goui runs only the bundled files. AutoEQ
downloads are text data, parsed as numbers.

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

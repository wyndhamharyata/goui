# goui

A Brave and Chromium extension that runs the audio of a browser tab through a parametric EQ. Search
your headphones and the AutoEQ profile for them applies at once. That is the neutral baseline. On top
of it you can add your own ear tuning from an eqbyear test, or tune by ear with three sliders, or edit
every band on the graph.

## Load it

1. Open `brave://extensions` or `chrome://extensions`.
2. Turn on Developer mode.
3. Choose Load unpacked and pick this folder.
4. Click the toolbar icon on a page that plays audio. The side panel opens and the capture starts
   for that page.

The icon click is what grants the extension the right to take the audio of that tab. To capture
another tab, click the icon on that tab.

## Use it

The header is on every tab. Hold **A/B** to hear the sound without the EQ. The switch turns the EQ
on or off. The level is the output in dB. Its light turns red when the EQ can clip.

**Listen**

- The stack at the top holds a **Headphone** layer and a **My ear** layer. Each row has its own switch,
  so AutoEQ alone compares against AutoEQ plus your ear with one press. **Change** opens the Library for
  that layer, and the ear row has an **×** to take it off.
- **Measure my ear with eqbyear** turns the ear layer off, opens eqbyear.com in a new tab and tells you
  the next step.
- Bass, Vocals and Treble nudge the sound. They sit on top of both layers and stay when you pick another
  sound.
- The preamp follows the largest boost, so the sound never clips. Move the slider to set it by hand.
  Press **Auto** to give it back.

**Tune**

- Drag a point to change that band's frequency and gain. A press alone only selects it. The point
  moves once you drag it 5 px. Hold Shift for fine steps.
- On a selected peak, pull the square side handles apart for a wider band, or scroll on the point.
- Double click empty space to make a new band. It joins the layer you last worked in.
- Ear bands carry a gold ring, and the chip row marks them with a **My ear** label. Each layer draws
  its own dashed curve under the solid total.
- All, Lows, Mids and Highs zoom the graph. **Tall** turns it, with low notes at the top.
- The inspector under the chips edits one band with exact numbers. **Solo** plays that band alone.

**Library**

- **Put into Headphone | My ear** decides the layer for a Paste, an Import, an AutoEQ headphone or a
  starter sound.
- Type your headphone model to search the AutoEQ headphones. A pick clears the search and takes you
  back to Listen.
- With the box empty, the list shows your saved sounds and a few starter sounds.
- A layer row says "edited" once you change one of its bands. A saved sound only changes when you save
  it again.
- **Save** keeps both layers under a name, sliders and preamp included. The name of the headphone layer
  is filled in. When that name exists, the button reads **Update** and writes over it. Picking a saved
  sound brings both layers back.
- **Import** loads a `ParametricEQ.txt` or JSON file. **Paste** takes the same text. The text joins the
  layer chosen above.
- **Export** writes both layers as one flat AutoEQ file, or as JSON, for use in other apps.

On a panel 900 px or wider, the three tabs show side by side.

## Measure your ear

An AutoEQ profile corrects the headphone, not your ear. An eqbyear test measures what your ear still
wants, and goui keeps the two apart.

1. On Listen, press **Measure my ear with eqbyear**. The ear layer turns off, so the test hears AutoEQ
   alone.
2. eqbyear opens in a new tab. Click the goui icon on that tab to capture it, then run the test.
3. Copy the result, return to goui, choose **My ear** under Put into, and paste it.
4. Turn the ear layer on to hear AutoEQ plus your ear.

## Commands

| Command         | What it does                                                            |
| --------------- | ----------------------------------------------------------------------- |
| `npm run lint`  | ESLint, then the word check.                                            |
| `npm test`      | The browser journeys. Run `npx playwright install chromium` once first. |
| `npm run icons` | Rebuild the icon files.                                                 |

## Notes

- The Web Audio shelf filters take no Q. An AutoEQ shelf keeps its corner frequency and gain and
  drops its Q. The inspector says so on a shelf.
- The tests open the panel as a normal tab and start capture with a launch flag.
- The extension can only change audio inside the browser. For system audio, use a tool such as
  SoundSource.

# goui

A Brave and Chromium extension that runs the audio of a browser tab through a parametric EQ. Search
your headphones and the AutoEQ profile for them applies at once. You can then tune by ear with three
sliders, or edit every band on the graph.

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

- The card at the top shows the sound you use. Press it to open the Library and pick another.
- Bass, Vocals and Treble nudge the sound. They stay when you pick another profile.
- The preamp follows the largest boost, so the sound never clips. Move the slider to set it by hand.
  Press **Auto** to give it back.

**Tune**

- Drag a point to change that band's frequency and gain. A press alone only selects it. The point
  moves once you drag it 5 px. Hold Shift for fine steps.
- On a selected peak, pull the square side handles apart for a wider band, or scroll on the point.
- Double click empty space to make a new band.
- All, Lows, Mids and Highs zoom the graph. **Tall** turns it, with low notes at the top.
- The inspector under the chips edits one band with exact numbers. **Solo** plays that band alone.

**Library**

- Type your headphone model to search the AutoEQ headphones. A pick clears the search and takes you
  back to Listen.
- With the box empty, the list shows your saved sounds and a few starter sounds.
- Every edit is kept as the sound you use, and the card on Listen then says "edited". A saved
  sound only changes when you save it again.
- **Save** keeps the sound you hear under a name, sliders and preamp included. The name of the
  current sound is filled in. When that name exists, the button reads **Update** and writes over it.
- **Import** loads a `ParametricEQ.txt` or JSON file. **Paste** takes the same text.
- **Export** writes the sound you hear as AutoEQ text or JSON, for use in other apps.

On a panel 900 px or wider, the three tabs show side by side.

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

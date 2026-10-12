# goui

Browser level EQ to show how easy and significant it is to adjust EQ for your headphone against
your own ear. It all comes down to a very simple mantra: different ear, different head, different
sound.

This extension works on the notion of joining two incredibly important audio tools: AutoEQ and
EQByEar. AutoEQ will give you a good neutral baseline against the headphone you personally use. Then
use EQByEar to adjust the fine details that are specific to the interaction between your headphone /
IEM and your hearing. Add flavour on top of that, based on your taste.

## Load it

1. Open `brave://extensions` or `chrome://extensions`.
2. Turn on Developer mode.
3. Choose Load unpacked and pick this folder.
4. Pin goui. Click the Extensions icon in the toolbar. It looks like a puzzle piece. Press the pin
   beside goui.
5. Open a page that plays audio and click the goui icon on it. The side panel opens and goui starts
   hearing that page.

A how-to guide opens in a tab once, on the first install. The **?** button in the panel opens it
again. It shows how goui works as a picture, each step with a picture of what to press, and links to
AutoEQ and eqbyear. Until goui hears its first tab, the panel itself shows the first three steps in
place of the EQ.

The icon is the on and off switch. Chrome only lets an extension take a tab's audio after you click
its icon on that tab, so the panel has no Start button.

- Click the icon on the tab goui hears to turn goui off.
- Click the icon on another tab to move goui there.
- The icon shows a green ON badge on the tab goui hears.
- Closing that tab turns goui off.

## Use it

The header is on every tab. It shows the title of the tab goui hears, or what to click when goui hears
nothing. Hold **A/B** to hear the sound without the EQ. The switch turns the EQ
on or off. The level is the output in dB. Its light turns red when the EQ can clip.

**Listen**

- The stack at the top holds a **Headphone** layer and a **My ear** layer. Each row has its own switch,
  so AutoEQ alone compares against AutoEQ plus your ear with one press. **Change** opens that layer in
  the Library, and the ear row has an **×** to take it off.
- Bass, Vocals and Treble nudge the sound. They sit on top of both layers and stay when you pick another
  preset.
- The preamp follows the largest boost, so the sound never clips. Move the slider to set it by hand.
  Press **Auto** to give it back.

**Tune**

- Drag a point to change that band's frequency and gain. A press alone only selects it. The point
  moves once you drag it 5 px. Hold Shift for fine steps.
- On a selected peak, pull the square side handles apart for a wider band, or scroll on the point.
- Double click empty space to make a new band. It joins the layer of the band you have selected, or the
  headphone layer when nothing is selected.
- The chips come in two rows, one for the headphone and one for My ear. Each row has its own **Add band**
  chip, and the chips wrap onto more lines as a layer gains bands. Ear bands carry a gold ring, and
  each layer draws its own dashed curve under the solid total.
- Press a chip to tune that band. Press it again to clear the choice.
- All, Lows, Mids and Highs zoom the graph. **Tall** turns it, with low notes at the top.
- The inspector under the chips edits one band with exact numbers. **Solo** plays that band alone.

**Library**

The Library has one section for each layer. Step 1 is your headphone. Step 2 is your ear, which tunes
the sound to your own hearing on top of the headphone. Each section has its own list of presets and its
own Save, Import, Paste and Export.

- **Save** keeps the bands you hear as a preset under a name. An AutoEQ pick fills in the headphone name,
  so one press keeps it. After an edit the button reads **Save changes**. **Save as new** keeps a second
  preset under another name.
- The list shows the presets you saved, and the one that plays now is marked. A pick from the list plays
  it again. The **×** on a row deletes it.
- In the headphone section, type a model to search the AutoEQ headphones. A pick clears the search and
  takes you back to Listen. The source under each name tells apart the measurements of one headphone.
- **Import** loads a `ParametricEQ.txt` file into that layer. **Paste** takes the same text. **Export**
  writes that one layer as AutoEQ text.
- **Measure my ear with eqbyear** is in the ear section. It turns My ear off, so the test hears the
  headphone alone, and opens eqbyear in a new tab.
- The ear list starts with **No ear tuning**, which turns the ear layer off.
- **Export the whole sound** at the bottom writes both layers and the sliders as one AutoEQ file.

On a panel 900 px or wider, the three tabs show side by side.

## Measure your ear

An AutoEQ profile corrects the headphone, not your ear. An eqbyear test measures what your ear still
wants, and goui keeps the two apart.

1. In the Library, press **Measure my ear with eqbyear** in the My ear section. The ear layer turns off,
   so the test hears the headphone alone.
2. eqbyear opens in a new tab. Click the goui icon on that tab to capture it, then run the test.
3. Copy the result, return to goui, and **Paste** it into the My ear section.
4. Press **Save** to keep it, then turn the ear layer on to hear the headphone plus your ear.

## Commands

| Command         | What it does                                                            |
| --------------- | ----------------------------------------------------------------------- |
| `npm run lint`  | ESLint, then the word check.                                            |
| `npm test`      | The browser journeys. Run `npx playwright install chromium` once first. |
| `npm run icons` | Rebuild the icon files.                                                 |

## Notes

- The Web Audio shelf filters take no Q. An AutoEQ shelf keeps its corner frequency and gain and
  drops its Q. The inspector says so on a shelf.
- The tests open the panel as a normal tab. They fire the icon's own click event in the service
  worker, since Playwright cannot press the toolbar icon. A launch flag lets that click capture.
- The extension can only change audio inside the browser. For system audio, use a tool such as
  SoundSource.

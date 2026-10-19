# Using goui

The panel works the same in the browser and on the Mac. Hold **A/B** to hear the audio without EQ.
Use the top switch to turn the EQ on or off. The meter shows output in dB and turns red when the
EQ may clip.

## Listen

- **Set** loads a saved Set. **Save as Set** saves the current layers and sliders.
- **Headphone**, **My ear** and **Taste** each have an on/off switch. **Change** opens that layer
  in the Library. Pressing **×** resets Headphone to Flat or removes the ear and taste layers.
- AutoEQ headphones show a **Target** picker for their measurement rig. Switching targets reloads
  the headphone and replaces manual band edits.
- **Bass**, **Vocals** and **Treble** adjust the sound across all layers and persist when you switch
  presets.
- **Preamp** automatically offsets the highest boost to prevent clipping. Drag the slider to set it
  manually, or press **Auto** to restore automatic gain.
- **Level match** keeps the preamp active while holding **A/B** so you compare the curve at equal
  volume.

## Tune

- Click a point or chip to select a band. Drag a point to change frequency and gain (hold Shift for
  fine adjustment).
- Drag the side handles on a selected Peak band or scroll the mouse wheel over a point to adjust
  bandwidth (Q).
- Double-click empty space on the graph or press **Add band** in the chip rows to add a band.
- Use **All**, **Lows**, **Mids** and **Highs** to zoom the frequency axis. **Tall** rotates the
  graph.
- The inspector edits the selected band's type, frequency (1 semitone per step), gain (0.5 dB per
  step) and Q. **On** mutes or unmutes the band, **Solo** isolates it, and **Delete** removes it.
- **Number table** shows all bands in a table.

## Library

The Library has tabs for **Headphone**, **My ear**, **Taste** and **Sets**.

- **Save** stores the layer's bands as a preset. **Save changes** updates an edited preset.
  **Save as new** saves under a new name.
- The **Headphone** search box searches your saved presets, starter sounds and the AutoEQ database.
  When a model has multiple measurements, **AutoEQ's pick** marks the recommended entry.
- **Import** loads a `ParametricEQ.txt` file. **Paste** reads AutoEQ text from a text box.
  **Export** outputs the current layer as AutoEQ text.
- **Measure my ear** in the **My ear** tab opens eqbyear.com and turns the ear layer off for the
  test.
- **No ear tuning** and **No taste** remove those layers.
- **Export** at the bottom of the Library outputs the combined sound (all active layers and
  sliders) as a single AutoEQ file.

At 900 px or wider, Listen, Tune and Library appear side by side.

## Sets

A Set links one headphone preset, one ear preset and one taste preset with the Bass, Vocals and
Treble sliders.

- Load a Set from the Listen tab or the Library's **Sets** tab.
- Every active layer with bands must be saved as a preset before saving a Set.
- Saving under an existing Set name replaces it.
- Sets reference presets by name. Updating a preset updates every Set that uses it.
- On the Mac, switch Sets from the menu bar or with `goui set "name"`.

## Measure your ear

AutoEQ corrects the headphone. EQByEar measures what your ears still need on top of that baseline.

1. In **Library > My ear**, press **Measure my ear**. goui turns the ear layer off so the test runs
   through your headphone layer alone.
2. On the new eqbyear.com tab, click the goui toolbar icon so goui captures the test tab (on the
   Mac, goui already processes browser audio). Complete the test.
3. Copy the exported ParametricEQ text. In **Library > My ear**, press **Paste**, paste the text,
   and press **Apply**.
4. Press **Save** to store your ear preset.

## The icon is the switch

Chrome allows tab audio capture only after you click the extension icon on that tab.

- With the panel open, click the icon on the active tab to turn goui off. With the panel closed,
  clicking it reopens the panel.
- Click the icon on another tab to move goui there.
- Installed web apps (like YT Music) have no side panel. Clicking the icon opens goui as a popup
  with its own power button.
- The icon shows a green ON badge on the captured tab.
- Closing the captured tab turns goui off.

## Notes

- Web Audio shelf filters do not use Q. goui preserves Q values from AutoEQ files on export, and
  notes this in the inspector.
- AutoEQ search results are cached locally for one week.
- Picking an alternate AutoEQ target fits up to six correction bands below 12 kHz to match the new
  target curve.
- The browser extension only affects the captured tab. Use goui for the Mac for system-wide audio.

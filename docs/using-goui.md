# Using goui

The control interface is consistent across the browser extension and macOS app. Hold **A/B** to
bypass processing. The main power toggle enables or disables processing system-wide or per-tab. The
signal meter indicates output levels in dB and displays peak warnings when clipping risks occur.

## Listen

- **Set:** Loads or saves layer selection and global tone slider positions.
- **Layers:** Toggle **Headphone**, **My ear**, or **Taste** independently. Click **Change** to open
  a profile in the Library, or **×** to clear a layer.
- **Target Selection:** AutoEQ profiles feature a **Target** drop-down to switch measurement rigs.
  Changing the target recalculates correction filters and overwrites manual edits.
- **Tone Sliders:** **Bass**, **Vocals**, and **Treble** adjust frequency response globally across
  all layers.
- **Preamp & Gain Staging:** Auto Preamp applies negative gain to offset peak boosts. Adjust
  manually via the slider, or click **Auto** to re-engage.
- **Level Match:** Maintains gain compensation during A/B bypass for volume-matched comparison.

## Tune

- **Band Selection:** Click or drag graph nodes and parameter chips to modify frequency and gain
  (hold Shift for fine adjustment).
- **Q Factor:** Drag side handles on a selected peak filter or scroll over a node to adjust
  bandwidth.
- **Manage Bands:** Double-click empty space or click **Add band**. The inspector panel edits filter
  type, frequency (1 semitone steps), gain (0.5 dB steps), Q, and includes **On**, **Solo**, and
  **Delete** actions.
- **Views:** Filter by **All**, **Lows**, **Mids**, or **Highs**. Click **Tall** to rotate
  orientation, or **Number table** for tabular editing.

## Library

- **Preset Operations:** **Save**, **Save changes**, or **Save as new** write parametric bands to
  local presets.
- **Headphone Search:** Queries local presets, defaults, and the remote AutoEQ database.
  Recommended curves carry an **AutoEQ's pick** badge.
- **Import/Export:** Import or paste `ParametricEQ.txt` text, export individual layers, or use the
  bottom **Export** button to write out the combined curve (all active layers plus sliders) as a
  single AutoEQ file.
- **Ear Calibration:** **Measure my ear** opens eqbyear.com and temporarily bypasses the ear layer
  for measurement accuracy.

> [!NOTE]
> On displays 900 px or wider, Listen, Tune, and Library render side by side.

## Sets

A Set links a headphone preset, ear profile, and taste configuration with global Bass, Vocals, and
Treble slider values. Active layers must be saved as named presets prior to saving a Set. Sets
maintain symbolic references by name. Updating an underlying preset automatically updates all Sets
referencing it.

## Ear Measurement Protocol

1. In **Library > My ear**, click **Measure my ear** (goui automatically bypasses the ear layer).
2. Run the measurement test on eqbyear.com. On Chrome, click the extension icon to capture the tab.
   On macOS, audio routing handles this automatically.
3. Paste the exported ParametricEQ text string back into **Library > My ear** and apply.

## Browser Tab Capture

Chrome restricts audio processing to explicit user selection via the extension icon:

- Click the icon to toggle power or open the side panel. Click the icon on a different tab to
  transfer capture.
- In PWAs, goui operates as a standalone popup window. A green badge indicates an active captured
  tab. Closing the tab terminates processing.

## Technical Details

- **Shelf Filter Q Factors:** Web Audio API shelf filters do not utilize Q parameters. goui
  preserves input Q values from imported files for export consistency and flags this in the
  inspector.
- **Target Fitting:** Selecting an alternate AutoEQ measurement target fits up to six parametric
  correction bands below 12 kHz to align with the new curve.
- **Scope Limitations:** The extension processes audio strictly within a single captured tab. Use
  the macOS application for system-wide CoreAudio routing.

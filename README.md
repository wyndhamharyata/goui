# goui

A Brave and Chromium extension that runs the audio of a browser tab through a parametric EQ. You
tune the EQ by dragging points on the curve in the side panel. You can also load AutoEQ files.

## Load it

1. Open `brave://extensions` or `chrome://extensions`.
2. Turn on Developer mode.
3. Choose Load unpacked and pick this folder.
4. Click the toolbar icon on a page that plays audio. The side panel opens and the capture starts
   for that page.
5. Play something in the tab. Drag a point on the curve to tune the sound.

The icon click is what grants the extension the right to take the audio of that tab. The panel takes
the page you last looked at. A live spectrum is drawn behind the curve. The number at the lower right
is the output level in dB.

To capture another tab, click the icon on that tab.

## Use it

- Drag a point to change that band's frequency and gain.
- Scroll on a point to change its Q.
- Double click a point to remove it, or double click empty space to add one.
- Press AutoEQ to paste a `ParametricEQ.txt` file or load one from disk.

## Commands

| Command        | What it does                                   |
| -------------- | ---------------------------------------------- |
| `npm run lint` | ESLint, then the word check.                   |
| `npm test`     | The browser journeys. Run `npx playwright install chromium` once first. |
| `npm run icons`| Rebuild the icon files.                        |

## Notes

- The Web Audio shelf filters take no Q, so an AutoEQ shelf keeps its corner frequency and gain and
  drops its Q.
- The tests open the panel as a normal tab and start capture with a launch flag. Clicking the
  toolbar icon is the real path. It needs one check by hand in Brave.
- The extension can only change audio inside the browser. For system audio, use a tool such as
  SoundSource.

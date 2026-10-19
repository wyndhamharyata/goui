# goui for the Mac

The Mac app runs all system audio through the same panel from the menu bar. It requires Apple
silicon and macOS 26 or later.

```sh
curl -fsSL https://raw.githubusercontent.com/wyndhamharyata/goui/main/mac/install.sh | sh
```

The installer checks your Mac and asks before installing. No admin password is required. It places
`goui.app` in `~/Applications`, registers a login item, and opens the panel. On first start, macOS
asks permission to record system audio. Press **Allow**. goui processes the audio in real time and
stores none of it.

- Click the menu bar icon to toggle the panel. Right-click for **About goui**, **Restart engine**,
  **Reload panel**, **Wide panel**, **Sets**, update options and **Quit goui**.
- **Sets** lists saved Sets and marks the active one. Pick a Set to switch without opening the
  panel.
- goui follows the default output device. Other system EQs (such as eqMac or SoundSource) stack on
  top of goui. Run only one at a time.
- Spatial Audio and head tracking on AirPods and Beats pause while goui is active.
- goui is not signed with an Apple Developer ID yet. Engine updates will prompt for audio
  permission again. Settings stay in `~/Library/Application Support/goui`.
- Panel-only updates apply automatically. Engine updates show **Update to …** in the menu.
- goui checks GitHub for updates twice a day and sends no user data.
- The `goui` CLI supports `start`, `stop`, `restart`, `set "name"`, `logs`, `rollback` and
  `uninstall`.

See [goui.mwyndham.dev/mac](https://goui.mwyndham.dev/mac) for details and troubleshooting. See
[`mac/engine/README.md`](../mac/engine/README.md) for the audio engine.

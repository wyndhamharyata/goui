# goui engine

The Mac audio engine described in `../PLAN.md`. It runs all system audio through a preamp and up to
32 biquad bands, matching the browser extension's Web Audio filters.

Code rules are in `CLAUDE.md` and the repo root `CLAUDE.md`.

`goui-engine` is the command-line tool. `goui` is the menu bar app run by `launchd`.
`goui-render-check` tests the C render code without an audio device.

Swift manages the Core Audio tap, aggregate device and property listeners. The real-time audio
callback and biquad filters are written in C under `Sources/Render/` to avoid allocations or locks
on the audio thread.

Filter updates load into an inactive filter chain and crossfade over 20 ms to prevent clicks.

| File | What it does |
| --- | --- |
| `goui-engine/main.swift` | Parses flags, runs the engine, prints meters and stops on signal |
| `goui/main.swift` | Starts the app (`--page` opens a test page instead of the panel) |
| `goui/AppController.swift` | Owns the engine, status bar menu, Sets submenu and floating panel |
| `goui/SetCommand.swift` | Watches `set-requests` for `goui set` commands and writes the reply |
| `goui/Places.swift` | Support file paths, launchd label and guide URL |
| `goui/UpdateMenu.swift` | Update menu items and twice-daily release check |
| `goui/ReleaseDownload.swift` | Fetches the latest GitHub release, verifies SHA-256 and unpacks |
| `goui/Install.swift` |Detects web-only vs full updates and installs them |
| `goui/FloatingPanel.swift` | Floating panel below the menu bar icon |
| `goui/WebFileServer.swift` | Serves `goui://app/` from updated web files or the app bundle |
| `goui/Bridge.swift` | WebKit script message handler for panel and Set commands |
| `goui/WebStorage.swift` | Stores panel state in `~/Library/Application Support/goui/storage.json` |
| `goui/SavedConfig.swift` | Stores engine power state and sound in `config.json` |
| `Render/Biquad.c` | Web Audio biquad filter coefficients and frequency response |
| `Render/Render.c` | Real-time audio callback, dual-chain crossfade and peak meters |
| `GouiEngine/Sound.swift` | Validates and converts `toPlayedSound` output into C filter structs |
| `goui-render-check/main.swift` | Verifies filter gains and crossfade smoothness on test tones |
| `GouiEngine/Engine.swift` | Manages the active audio tap and restarts on device or rate changes |
| `GouiEngine/AudioSetup.swift` | Creates and tears down the Core Audio tap and aggregate device |
| `GouiEngine/CoreAudioProperty.swift` | Core Audio property wrappers and error type |
| `goui-engine/Options.swift` | CLI argument parser |
| `GouiEngine/Report.swift` | Formats meter output |

## Build and run

```sh
swift build
.build/debug/goui-engine --gain-db -6 --bass-db 6
```

`--seconds 10` stops after 10 seconds, or press Control-C. Every 2 seconds it prints callback rate,
input/output peak levels, clipped sample count and overload count. `--gain-db` accepts -24 to 12.
`--bass-db` accepts -24 to 24.

macOS prompts for System Audio Recording permission on first run.

### Menu bar app

```sh
App/make-app.sh
App/agent.sh start
```

`make-app.sh` bundles `.build/goui.app` with `src/` and `mac/web/` and signs it ad hoc.
`agent.sh start` writes `~/Library/LaunchAgents/com.goui.app.plist` and starts the agent.
`agent.sh stop` stops the app and removes the plist. Logs go to `~/Library/Logs/goui.log`.

For check pages:
- `App/agent.sh start --page mac/web/checks/bridge.html` tests the WebKit bridge.
- `App/agent.sh start --page mac/web/checks/biquads.html` compares the C filters against WebKit.

### Release tarball

```sh
App/make-tarball.sh
GOUI_TARBALL=.build/goui-mac.tar.gz sh ../install.sh
```

`make-tarball.sh` builds `.build/goui-mac.tar.gz`. `install.sh` installs `goui.app` to
`~/Applications` and links `goui` in `~/.local/bin`. `App/reinstall.sh` (or `npm run mac` from the
repo root) builds and installs in one step.

### Updates

The app checks `https://api.github.com/repos/wyndhamharyata/goui/releases/latest` one minute after
launch and twice a day after that. It verifies `goui-mac.tar.gz` against the release `-sha256.txt`
file.

If only files inside `Contents/Resources/web` changed, the app copies them to
`~/Library/Application Support/goui/web` and reloads the panel in place. If the executable or
other bundle files changed, the menu shows **Update to …** to replace the app and restart.

Set `GOUI_UPDATE_FEED` to a local JSON file or URL to test updates against a custom feed:

```sh
launchctl setenv GOUI_UPDATE_FEED /tmp/release.json
goui restart
launchctl unsetenv GOUI_UPDATE_FEED
```

### Render check

```sh
swift run -c release goui-render-check
```

Runs sine waves through each filter type to verify gain accuracy and checks that mid-wave filter
changes produce no sample steps larger than the wave itself.

## Manual verification

Run these checks after `npm run mac` with `goui logs` open:

1. **Level and spectrum.** Play audio and open the panel. The level meter and spectrum move.
2. **First-run guide.** Delete `hasCaptured` from `storage.json` and pick **Reload panel**. Five
   setup steps appear.
3. **Menu and Sets.** Right-click the menu bar icon. Verify **About goui**, **Restart engine**,
   **Reload panel**, **Wide panel**, **Sets**, update items and **Quit goui**.
4. **32-band limit.** A Set with more than 32 active bands (including sliders) is refused by both
   the menu and `goui set`.
5. **CLI.** Verify `goui set "name"`, `goui stop`, `goui start` and `goui rollback`.
6. **Crash recovery.** Hold **A/B** and run `kill -9` on `goui`. When `launchd` restarts it, the
   saved EQ plays rather than the bypassed audio.

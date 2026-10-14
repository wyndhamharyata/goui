# goui for macOS, plan

An experiment. goui EQs one browser tab. The Mac app would EQ every sound the Mac plays, with the
same bands, the same AutoEQ search and the same targets. The extension and the app share the EQ
code and the panel itself.

Only the newest macOS is in scope. Spatial Audio, head tracking and other features of Apple
headphones are out of scope. Branding comes later. The first goal is a Mac app that works with the
panel the extension already has.

## How other apps do it

| App | How it takes the sound | Install |
| --- | --- | --- |
| eqMac | Its own virtual output device, a HAL plug-in based on Apple's Null Audio Server sample. The app reads that device and plays the result to the real one. Its UI is a web page. | Admin password, coreaudiod restart |
| Background Music | The same idea, open source. Its playthrough code is the best reference for clock drift. | Admin password |
| SoundSource | Rogue Amoeba's ARK plugin since September 2024. Their notes say it sets up in seconds with no restart. They do not say what it runs on. | Seconds |
| Core Audio taps | Apple's own API since macOS 14.2. A tap takes the output of some or all processes and can mute the original. | A permission prompt |

goui uses Core Audio taps. `engine/` proves the path works. Its README lists what was checked.

## Rules for this app

- As much as possible runs in JavaScript. Swift is for what only native code can do: the tap, the
  devices, the socket, the menu bar icon, the panel window and launchd.
- The extension's panel runs as it is. A Mac feature goes in a page around the panel or in the
  `chrome` stand-in, never in `src/`.

## Two processes

| | Server, `goui-engine` | Tray, `goui.app` |
| --- | --- | --- |
| Runs | All the time, from login, as a LaunchAgent | When you want the panel, also from login |
| Owns | The tap, the output device, the biquads, the saved config | The menu bar icon, the floating panel, the web view |
| Swift | The engine from `engine/`, a socket server, the config file | `NSStatusItem`, `NSPanel`, `WKWebView`, a right-click menu |
| JavaScript | None | The panel, the `chrome` stand-in, the page around the panel |

The server plays with the tray closed or crashed. At login it reads the last config and plays it
before any window opens.

### A stuck server

A killed server is always safe. macOS removes its muted tap and the Mac plays the normal way again.
So every way back is a hard kill and a fresh start.

1. A crash. launchd starts it again, with `KeepAlive` in its plist.
2. A hang or silence. The server watches its own callback count. When the callbacks stop while
   audio should play, it builds its session again.
3. By hand from the tray. The right-click menu has **Restart engine**, which runs
   `launchctl kickstart -k`. It works even when the web view is broken. The page around the panel
   also shows a status dot and a restart button when the server stops answering.
4. By hand from a terminal. `goui restart` does the same.

### Between the page and the server

The web view talks to the server itself, so the tray needs very little Swift.

- The server listens with a WebSocket on `127.0.0.1`. It takes a connection only from the
  `goui://app` origin with a random token. The tray hands the token to the page. A website cannot
  read the token.
- `mac/web/chrome.js` stands in for the Chrome APIs the panel calls.

| Chrome API | In the app |
| --- | --- |
| `chrome.storage.local` and `session` | Messages to the server, which keeps a JSON file |
| `chrome.runtime.sendMessage` | Messages to the server |
| `chrome.runtime.onMessage` | Events from the server, passed to the panel's listeners |
| `chrome.runtime.getURL` | A `goui://app` address |
| `chrome.tabs.create` | A message to the tray, which opens the link in the default browser |

- Before a config goes to the server, `chrome.js` runs `makePlayedSound` from `src/shared/config.js`.
  The server only ever takes `{ preampDb, bands }` and keeps the last one for the next login.

### Bands to sound

The biquad formulas are the one piece of math outside JavaScript. When the sample rate changes with
the panel closed, as it does when a call starts on a Bluetooth headphone, the server must work out
the filters again on its own. The formulas come from the Web Audio spec, so the shelves take no Q
and LP and HP read Q in dB. They live in C next to the render code, about 60 lines. A check in the
page compares the C response with WebKit's `getFrequencyResponse` for the same bands. The server
swaps to new filters without a lock and fades across about 20 ms, so a change does not click.

### The existing panel in the tray

- The web view loads `src/panel.html` as it is, served under `goui://app` from the extension's own
  files. The tray puts `chrome.js` in the page before the panel's code runs.
- The panel opens in its popup mode. Its power button already sends `capture:start` and
  `capture:stop`. `chrome.js` turns those into engine on and off.
- `mac/web/shell.html` holds the panel in an iframe, with the Mac controls above it: the server
  status and its restart button now, the output device later.
- Words about the tab read oddly on a Mac for now. They wait for the branding pass, with the level
  and spectrum meters.

## Install

A curl line installs goui. npm, a DMG and a PKG come later.

- `install.sh` downloads one tarball from GitHub Releases and unpacks it to
  `~/Applications/goui.app`. No admin password.
- The tarball holds the tray, the server inside its `Contents/`, the files of `src/` and `mac/web/`,
  and the `goui` command.
- The script writes two plists to `~/Library/LaunchAgents`, one for the server and one for the
  tray, and starts them with `launchctl bootstrap`. Running the curl line again updates goui.
- `curl` sets no quarantine flag, so Gatekeeper does not stop the binaries.
- npm can come later as a thin wrapper, `npx goui install`, around the same tarball. Many setups
  block `postinstall`, so the install runs only when you ask for it.

The `goui` command is a shell script.

| Command | What it does |
| --- | --- |
| `goui restart` | `launchctl kickstart -k` on the server |
| `goui stop`, `goui start` | Stops or starts the server |
| `goui logs` | Shows the server log |
| `goui uninstall` | Removes both agents and the app |

### Signing

The binaries are signed ad hoc for now. macOS remembers the System Audio Recording permission by
the code signature, and an ad hoc signature changes with every build. So each update asks for the
permission again. A Developer ID signature stays the same across updates. It costs $99 a year and
waits until goui has users.

## Steps

Each step starts only when it is asked for, and ends with a commit.

1. Server. The WebSocket with its origin and token checks, the config file, and commands for
   bands, on and off, and status.
2. Biquads in C for every band type, the swap without a click, and the check against WebKit.
3. Tray. The icon, the floating panel, the web view, and the right-click menu with
   **Restart engine** and **Quit**.
4. `chrome.js` and `shell.html`, so the existing panel drives the server.
5. Install. A script that builds the tarball, `install.sh` with the two plists, and the `goui`
   command.

## Settled

- A LaunchAgent with no window can ask for System Audio Recording. macOS names the agent's own
  binary in the prompt, not the terminal or the tray. Until the person presses Allow, the engine
  waits at the request and builds no tap. So the server reports a status that says it waits for
  the permission. Once allowed, the agent played a test tone at -40.2 dBFS out at -46.2 with -6 dB
  of gain, on a Bluetooth headphone at 44.1 kHz.
- The permission follows the ad hoc signature, which changes with each build. A new build asks
  again.

## Open questions

- How the Mac journeys run. Playwright cannot drive a `WKWebView`. One way is the panel in Chromium
  against the real server, with the server writing what it plays to a file the journey reads.
- How the floating panel and the web view handle keyboard focus. Typing in the AutoEQ search must
  work while music plays in another app.

## Options set aside

| Option | Why not |
| --- | --- |
| gpuix | It draws natively with no web view, so the panel would be written twice. |
| Electron | It bundles Chromium, about 150 MB, for a menu bar app. |
| Tauri | It uses the same `WKWebView` on the Mac, with Rust in between. |
| Wails v3 | Go is pleasant, but v3 is still beta. It saves about 215 lines of Swift and costs about 350 lines of Go. The panel focus and position code would live in Wails, out of reach. |
| Electrobun | Bun in the main process, but beta, and the panel position is left to the app. |
| SMAppService | It suits an app in `/Applications`. A curl install writes its own LaunchAgent plists. |

## Troubleshooting text for the README

> **AirPods and Beats sound flat or lose head tracking**
>
> goui is not made for Spatial Audio or head tracking. macOS applies them only when an app plays
> straight to AirPods or Beats. goui plays in between, so the effect drops out or can sound wrong.
> Turn off Spatial Audio for the headphone in Control Center, or quit goui while you use it.

## Sources

- Apple, "Capturing system audio with Core Audio taps", developer.apple.com
- eqMac README, github.com/bitgapp/eqMac
- SoundSource release notes, rogueamoeba.com/soundsource/releasenotes.php
- ARK-SDK, rogueamoeba.com/licensing
- AudioCap, github.com/insidegui/AudioCap
- Wails v3 source, github.com/wailsapp/wails

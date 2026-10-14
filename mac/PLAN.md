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
  devices, the menu bar icon, the panel window, the bridge to the page and launchd.
- The extension's panel runs as it is. A Mac feature goes in a page around the panel or in the
  `chrome` stand-in, never in `src/`.

## One process

`goui.app` is one process. It runs from login as a LaunchAgent and holds both halves.

| | Engine | Panel |
| --- | --- | --- |
| Owns | The tap, the output device, the biquads, the saved config | The menu bar icon, the floating panel, the web view |
| Swift | The engine from `engine/` and the config file | `NSStatusItem`, `NSPanel`, `WKWebView`, the bridge, a right-click menu |
| JavaScript | None | The panel, the `chrome` stand-in, the page around the panel |

At login the app reads the last config and plays it before any window opens. The sound plays with
the panel closed.

The page runs in WebKit's own process, so a broken page cannot stop the sound. The audio runs on
Core Audio's own thread, so a stuck main thread does not stop it either.

### A stuck engine

A killed app is always safe. macOS removes its muted tap and the Mac plays the normal way again.
So every way back is a hard kill and a fresh start, or a fresh engine inside the app.

1. A crash. launchd starts the app again, with `KeepAlive` in its plist.
2. A hang or silence. The engine watches its own callback count. When the callbacks stop while
   audio should play, it builds its session again.
3. By hand from the menu. The right-click menu has **Restart engine**, which builds the engine
   again, and **Reload panel**, which loads the page again. Both work when the web view is broken.
   The page around the panel also shows a status dot and a restart button.
4. By hand from a terminal. `goui restart` runs `launchctl kickstart -k` on the app.

### Between the page and Swift

The page talks to Swift through WebKit's own message channel. Nothing outside the app can reach
it, so it needs no port, token or origin check.

- The page sends with `window.webkit.messageHandlers.goui.postMessage`, and a reply comes back as
  the result of that call.
- Swift sends events to the page with `callAsyncJavaScript`.
- `mac/web/chrome.js` stands in for the Chrome APIs the panel calls.

| Chrome API | In the app |
| --- | --- |
| `chrome.storage.local` and `session` | Messages to Swift, which keeps a JSON file |
| `chrome.runtime.sendMessage` | Messages to Swift |
| `chrome.runtime.onMessage` | Events from Swift, passed to the panel's listeners |
| `chrome.runtime.getURL` | A `goui://app` address |
| `chrome.tabs.create` | A message to Swift, which opens the link in the default browser |

- Before a config goes to Swift, `chrome.js` runs `toPlayedSound` from `src/shared/config.js`.
  The engine only ever takes `{ preampDb, bands }` and keeps the last one for the next login.

### Bands to sound

The biquad formulas are the one piece of math outside JavaScript. When the sample rate changes with
the panel closed, as it does when a call starts on a Bluetooth headphone, the engine must work out
the filters again on its own. The formulas come from the Web Audio spec, so the shelves take no Q
and LP and HP read Q in dB. They live in C next to the render code, about 60 lines. A check in the
page compares the C response with WebKit's `getFrequencyResponse` for the same bands. The engine
swaps to new filters without a lock and fades across about 20 ms, so a change does not click.

### The existing panel in the app

- The web view loads `src/panel.html` as it is, served under `goui://app` from the extension's own
  files. The app puts `chrome.js` in the page before the panel's code runs.
- The panel opens in its popup mode. Its power button already sends `capture:start` and
  `capture:stop`. `chrome.js` turns those into engine on and off.
- `mac/web/shell.html` holds the panel in an iframe, with the Mac controls above it: the engine
  status and its restart button now, the output device later.
- The web view is built when the panel first opens. If it holds too much memory with the panel
  closed, the app can drop it on close and build it again on open.
- Words about the tab read oddly on a Mac for now. They wait for the branding pass, with the level
  and spectrum meters.

## Install

A curl line installs goui. npm, a DMG and a PKG come later.

- `install.sh` downloads one tarball from GitHub Releases and unpacks it to
  `~/Applications/goui.app`. No admin password.
- The tarball holds the app, the files of `src/` and `mac/web/` inside its `Contents/`, and the
  `goui` command.
- The script writes one plist to `~/Library/LaunchAgents` and starts it with
  `launchctl bootstrap`. Running the curl line again updates goui.
- `curl` sets no quarantine flag, so Gatekeeper does not stop the binary.
- npm can come later as a thin wrapper, `npx goui install`, around the same tarball. Many setups
  block `postinstall`, so the install runs only when you ask for it.

The `goui` command is a shell script.

| Command | What it does |
| --- | --- |
| `goui restart` | `launchctl kickstart -k` on the app |
| `goui stop`, `goui start` | Stops or starts the app |
| `goui logs` | Shows the app log |
| `goui uninstall` | Removes the agent and the app |

### Signing

The binaries are signed ad hoc for now. macOS remembers the System Audio Recording permission by
the code signature, and an ad hoc signature changes with every build. So each update asks for the
permission again. A Developer ID signature stays the same across updates. It costs $99 a year and
waits until goui has users.

## Steps

Each step starts only when it is asked for, and ends with a commit.

1. Permission check. Done, see Settled.
2. App. The menu bar icon, the floating panel, the web view, the bridge, the engine inside the
   app, the config file, and the right-click menu with **Restart engine**, **Reload panel** and
   **Quit**.
3. Biquads in C for every band type, the swap without a click, and the check against WebKit.
4. `chrome.js` and `shell.html`, so the existing panel drives the engine through the bridge.
5. Install. A script that builds the tarball, `install.sh` with the plist, and the `goui`
   command.

## Settled

- A LaunchAgent with no window can ask for System Audio Recording. macOS names the agent's own
  binary in the prompt, not the terminal. Until the person presses Allow, the engine waits at the
  request and builds no tap. So the app reports a status that says it waits for the permission.
  Once allowed, the agent played a test tone at -40.2 dBFS out at -46.2 with -6 dB of gain, on a
  Bluetooth headphone at 44.1 kHz.
- The permission follows the ad hoc signature, which changes with each build. A new build asks
  again.
- goui is one process, not a server and a tray. See Options set aside.
- One app that is also a menu bar icon, started by launchd, asks for System Audio Recording, and
  the prompt names goui. `engine/App/` builds it and starts it as a LaunchAgent. It played the
  sound of the Mac 6 dB quieter through the speakers at 48 kHz, 94 callbacks a second with no
  overload. After `kill -9`, launchd started it again within 10 seconds, with no new prompt.
  **Quit goui** in its menu exits with 0, so launchd does not start it again, and the sound comes back at
  full level.

## Open questions

- How the Mac journeys run. Playwright cannot drive a `WKWebView`. One way is the panel and
  `chrome.js` in Chromium against a stand-in for the bridge, with the engine checked on its own
  by what it plays.
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
| SMAppService | It suits an app in `/Applications`. A curl install writes its own LaunchAgent plist. |
| A server and a tray | A `goui-engine` LaunchAgent with a WebSocket on `127.0.0.1`, and a tray app whose page talks to it. Any local process and any website can reach that port, so it needs a token, an origin check and a port choice. It also means two binaries, two plists and a message protocol to keep in step. One process plays from login, keeps playing through a broken page and restarts after a crash just as well. What it gives up: the tests cannot run the panel in Chromium against the real engine, and other apps cannot drive goui. A socket can come back when one of those is needed. |

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

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
   The panel's status line shows when the engine waits to try again, with its error.
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
| `chrome.storage.local` | Messages to Swift, which keeps `storage.json` |
| `chrome.storage.session` | Kept in the page. `capture` is read from the engine's status each time |
| `chrome.runtime.sendMessage` | `audio:config` becomes a sound, `capture:start` and `capture:stop` power on and off |
| `chrome.runtime.onMessage` | The engine's status as `capture:state`, and its output peak as `audio:telemetry` |
| `chrome.runtime.getURL` | A `goui://app` address |
| `chrome.tabs.create` | A web page opens in the default browser. A goui page opens the homepage, as the guide is for Chrome |

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
- The panel opens in its popup mode, as the popup of one stand-in tab. Its power button sends
  `capture:start` and `capture:stop`, and `chrome.js` turns those into engine on and off. The popup
  also asks to start as it opens. `chrome.js` takes a start only from a click, so opening the panel
  does not turn goui back on.
- The panel's status line shows the engine's status. The right-click menu holds the Mac's own
  controls. The output device will need a place of its own when it comes.
- The panel takes the height of its page, up to the height of the screen.
- The panel has no console on the Mac, so `chrome.js` sends its errors to the app's log.
- The web view is built when the panel first opens, and stays. See Settled for why it is not
  dropped on close.
- The panel's words and its Get started steps speak of the Mac, not a tab. `chrome.js` sets
  `window.gouiWords`, which `src/panel/capture.js` reads for the status line and the power button,
  and `mac/web/guide.js` puts the Mac's own steps in place of the extension's. The guide and help
  links open goui.mwyndham.dev/mac.

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
2. App. Done, see Settled.
3. Biquads in C. Done, see Settled.
4. `chrome.js`. Done, see Settled.
5. Install. Done, see Settled.

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
- The app holds the engine, the menu bar item, the floating panel and its web view.
  `mac/web/checks/bridge.html` sends every bridge message. A preamp of -6, -12 and -40 played the
  sound 6, 12 and 24 dB lower, as the preamp stops at -24. The EQ switch off played it as it is.
  Power off and on sent a status event each time. An unknown message and a sound with no data were
  refused with the reason. After `kill -9`, the app came back at the -6 dB that `config.json` kept.
- A new build asks for the permission again, as the ad hoc signature changes.
- The C filters match WebKit's `getFrequencyResponse` to 0.0001 dB, for 300 bands of every type at
  16, 44.1 and 48 kHz, built by the extension's own `createBiquad`. That covers bands above the
  Nyquist frequency at 16 kHz, and the low and high pass that read Q in dB.
- A change of sound fades over 20 ms between two filter chains, and the new chain takes the old
  one's filter memory. `goui-render-check` changes the sound at a peak of a tone, and the largest
  step between two samples stays within the tone's own. With no fade, the steps reached 1.8 to 100
  times that. A change during a fade waits, and only the newest sound goes in.
- The tap is built on its own queue. The first build of each new signature waits there for the
  permission prompt, while the menu bar item and the panel keep working. The panel shows that goui
  is starting. A stop or a newer start during the wait takes down the build when it ends.
- The extension's panel runs in the app as it is, with `chrome.js`. The Bass, Vocals and Treble
  sliders, the preamp with Auto, Level match with A/B, the AutoEQ search and its profiles, and the
  links all work. The search box takes typing while music plays in another app. The panel was
  not built inside `shell.html`, as an iframe would only add sizing and focus to handle.
- **Restart engine** takes the tap down and builds it again, so the sound plays as it is for a
  moment, louder, then drops back. A new output device or rate does the same. Building the new tap
  before taking the old one down would play both at once. **Quit goui** brings the sound back at
  full level and the item goes away. **Reload panel** loads the same page again, so nothing shows.
- The level and spectrum show in the Mac panel. The audio callback keeps the last 8192 frames it
  played, mixed to mono, and `mac/web/spectrum.js` reads them as the extension's `AnalyserNode`
  does, 20 times a second. On the same samples it matches Chromium's spectrum to 0.0001 dB.
- The engine reads its callback count every 2 s, and builds the path again when it has not moved.
  A build whose callbacks stopped after 5 s was built again each time, and a healthy engine ran on
  with no restart.
- A hidden panel's page costs 50 to 65 MB in WebKit's processes, against 24 MB for goui. Letting
  it go was tried three ways, and none freed it. With the web view taken out of the panel, AppKit
  and WebKit still held it. When it was freed, WebKit kept its page process. Loading
  `about:blank` in its place left the page in the back-forward cache. macOS compresses the memory
  of an idle process, so the page stays.
- About goui shows the name, the icon and the version, which `make-app.sh` takes from
  `manifest.json`, so the app and the extension carry one version.
- `App/make-tarball.sh` packs `goui.app` as `goui-mac.tar.gz`, about 250 KB, with the `goui`
  command, the licence and the notices inside. `mac/install.sh` unpacks it to
  `~/Applications/goui.app`, links `~/.local/bin/goui`, writes the plist and starts it, with no
  admin password. The signature checks out after unpacking. `GOUI_TARBALL` installs a local build.
  `goui start`, `stop`, `restart`, `logs` and `uninstall` each worked, `start` twice in a row too,
  and `uninstall` keeps the settings. The installed app and `App/agent.sh` share one label, so
  each takes the agent over from the other.
- `install.sh` stops with a reason on an Intel Mac or a macOS before 26, and warns, then asks,
  when another system EQ runs or the sound goes to AirPods or Beats. It names the version change,
  lists the limits with a link to goui.mwyndham.dev/mac#before, and asks before it installs. With
  no terminal it takes the defaults, and `GOUI_YES=1` answers yes.
- After an install or an update, goui opens its panel once, so the menu bar item is easy to find.
  `install.sh` writes `just-installed` in the settings folder, and the app deletes it at launch. It
  waits for the tap to be built: building it gives the focus back to the app in front, which hid a
  panel opened any sooner.
- The panel makes goui the active app as it opens. On a fresh start goui is not active, and macOS
  gave the focus back to the app in front, which hid the panel, so it took three clicks to open.
- The Mac app has no journeys for now. Playwright cannot drive a `WKWebView`, and the panel's own
  journeys run in the extension. The Mac is checked by hand, with `goui-render-check` for the
  filters and the pages in `mac/web/checks/` for the bridge. If journeys come, they can run the
  panel and `chrome.js` in Chromium against a stand-in for the bridge.

## Open questions

- None for now.

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

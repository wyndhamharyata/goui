# goui for macOS, plan

An experiment. goui EQs one browser tab. The Mac app would EQ every sound the Mac plays, with the
same bands, the same AutoEQ search and the same targets. The extension and the app share the EQ
code and the panel itself.

Only the newest macOS is in scope. Spatial Audio, head tracking and other features of Apple
headphones are out of scope.

## How other apps do it

| App | How it takes the sound | Install |
| --- | --- | --- |
| eqMac | Its own virtual output device, a HAL plug-in based on Apple's Null Audio Server sample. The app reads that device and plays the result to the real one. Its UI is a web page. | Admin password, coreaudiod restart |
| Background Music | The same idea, open source. Its playthrough code is the best reference for clock drift. | Admin password |
| SoundSource | Rogue Amoeba's ARK plugin since September 2024. Their notes say it sets up in seconds with no restart. They do not say what it runs on. | Seconds |
| Core Audio taps | Apple's own API since macOS 14.2. A tap takes the output of some or all processes and can mute the original. | A permission prompt |

goui uses Core Audio taps. `engine/` proves the path works. Its README lists what was checked.

## The app

One Swift app with no Dock icon. It has three parts.

| Part | Built with | Job |
| --- | --- | --- |
| Menu bar icon and panel | AppKit | An icon at the top of the screen. A click drops a floating panel under it. |
| The panel | The extension's own `src/panel.html` in a `WKWebView` | Everything you see and edit, the same files as the extension |
| Engine | Swift with a C callback, from `engine/` | Tap, aggregate device, biquads, device and rate changes |

The audio does not depend on the panel. The engine keeps playing with the panel closed, and the web
view can be thrown away to save memory.

### The floating panel

An `NSStatusItem` holds the icon. A click opens an `NSPanel` right under it, about 400 px wide,
the size of the extension's popup layout. A click anywhere else closes it. A pin keeps it open and
floating above other windows while you play music in another app.

Things to get right:

- The panel must take key presses without taking focus from the app you were in. That needs a
  non-activating panel that can still become the key window, or the AutoEQ search field ignores
  typing.
- It opens on the screen that holds the menu bar you clicked, and over full screen apps.
- The app runs as an accessory, with `LSUIElement` set, so it has no Dock icon and no app menu.

### The panel as a web page

The extension loads `src/` with no build step. The app serves the same folder to the web view
under a custom scheme such as `goui://app/src/panel.html`. A `file://` page cannot load ES
modules, so the custom scheme is needed. In development it serves the repo's `src/`, so a change
shows in both at once.

WebKit has Web Audio. `responseDb` and the graph work as they are, with the same
`OfflineAudioContext`. The earlier step that rewrote the core without Web Audio is no longer
needed.

The panel calls six Chrome APIs in 18 places. The app gives the page a small `chrome` object at
load, before the panel's own code runs.

| Chrome API | In the app |
| --- | --- |
| `chrome.storage.local` and `session` | A JSON file in Application Support, through a message to Swift |
| `chrome.runtime.sendMessage` | A message to Swift. The engine takes the bands and the preamp. |
| `chrome.runtime.onMessage` | Swift calls into the page, for the capture state and the level |
| `chrome.runtime.getURL` | A `goui://` address |
| `chrome.tabs.create` | Opens the link in the default browser |

The panel needs a Mac mode for its words and a few controls. Tab words such as "the tab goui
hears" become "your Mac". The power pill from the popup turns the engine on and off. The intro
about the toolbar icon does not apply.

### Bands to sound

The page sends the bands and the preamp, as it sends them to the offscreen document today. Web
Audio does not give out its filter numbers, so the engine works them out in C from the formulas
in the Web Audio spec. Its shelves take no Q, and its LP and HP read Q in dB. A check in the app
can compare the C response with WebKit's `getFrequencyResponse` for the same bands. The engine
swaps to the new numbers without a lock and fades across about 20 ms.

## Options set aside

| Option | Why not |
| --- | --- |
| gpuix | It draws natively with no web view, so the panel would be written twice. |
| Electron | It bundles Chromium, about 150 MB, for a menu bar app. The engine would need a Node addon. |
| Tauri | It uses the same `WKWebView` on the Mac, with Rust in between. The engine is Swift already. |
| SwiftUI `MenuBarExtra` | A native menu bar window, but the panel would be written twice. |

## Steps

Each step ends with a commit.

1. **Menu bar app.** An icon, the floating panel with its pin, and the extension's panel in the web
   view with the `chrome` object for storage only. The engine runs at a fixed gain.
2. **Bands to the engine.** The C biquads for every band type, the swap without a click, and the
   check against WebKit's response. Moving a point in the panel changes the sound of the Mac.
3. **Mac mode.** The words, the power pill, the capture state and the level meter.
4. **Package.** An `.app` bundle with `src/` inside, a Developer ID signature, notarization and
   launch at login.

## Risks

- Journeys today start in Chrome with the extension loaded. A Mac journey needs the app, a tone
  and a way to record what the engine plays. The engine could write what it plays to a file for
  that, as a real feature for checking a sound. How the Mac journeys run is still open.
- A `WKWebView` takes about 50 to 80 MB while the panel is open. The app can drop it when the
  panel closes.
- A non-activating panel and a web view can disagree about keyboard focus and mouse moves. Step 1
  checks typing in the search field and hover on the graph.

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

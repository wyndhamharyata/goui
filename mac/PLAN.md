# goui for macOS, plan

An experiment. goui EQs one browser tab. The Mac app would EQ every sound the Mac plays, with the
same bands, the same AutoEQ search and the same targets. One JavaScript core serves both.

Only the newest macOS is in scope. Spatial Audio, head tracking and other features of Apple
headphones are out of scope.

## How other apps do it

| App | How it takes the sound | Install |
| --- | --- | --- |
| eqMac | Its own virtual output device, a HAL plug-in based on Apple's Null Audio Server sample. The app reads that device and plays the result to the real one. | Admin password, coreaudiod restart |
| Background Music | The same idea, open source. Its playthrough code is the best reference for clock drift. | Admin password |
| SoundSource | Rogue Amoeba's ARK plugin since September 2024. Their notes say it sets up in seconds with no restart. They do not say what it runs on. | Seconds |
| Core Audio taps | Apple's own API since macOS 14.2. A tap takes the output of some or all processes and can mute the original. | A permission prompt |

goui uses Core Audio taps. No driver, no restart, no admin password. When the app quits or crashes,
its tap goes away and the Mac plays sound the normal way again. A virtual device would leave the
Mac silent instead.

## The audio path

1. Create a tap of every process except the app itself, with `muteBehavior` set to mute the
   original. The app taps itself out, or it would hear its own output.
2. Create a private aggregate device that holds the tap as input and the real output device.
   Turn on drift correction for the tap.
3. An IOProc on the aggregate device reads the tap, runs the preamp and the biquads, and writes to
   the output.
4. When the default output or its sample rate changes, build the aggregate device again and fade
   in.

The prompt is "System Audio Recording Only". It needs `NSAudioCaptureUsageDescription` in the
Info.plist. macOS gives the permission to the app bundle. A bare binary run from a terminal asks
for the terminal instead.

## What runs where

JavaScript never runs on the audio thread. A garbage collection pause there is a click.

| Part | Language | Job |
| --- | --- | --- |
| Core | JavaScript, in `src/shared/` | Config, AutoEQ files, targets, the fit, the auto preamp, biquad coefficients |
| Engine | Native, a C interface | Tap, aggregate device, IOProc, the biquad loop, device changes |
| App | Bun and gpuix | The window, storage, the AutoEQ search, the bridge to the engine |

The core hands the engine finished numbers: the preamp and one `b0 b1 b2 a1 a2` row per band, for
the sample rate the engine reports. The formulas live in one place. The engine only multiplies.
The engine swaps to a new chain without a lock and crossfades for about 20 ms, so a change does
not click.

The extension keeps loading `src/` with no build step. The app imports the same files from
`../src/shared/`. Nothing under `mac/` goes into the extension zip.

## Steps

Each step ends with a commit.

### 1. Engine trial, no UI

A command line tool in `mac/engine/` that plays the Mac through a fixed list of biquad rows read
from a JSON file. It answers these questions before anything else is built:

- Does the mute stop the original sound in Safari, Chrome and Music? Chrome plays from helper
  processes.
- Does an hour of music play with no click, with drift correction on and with it off?
- What happens when AirPods connect, when an HDMI screen unplugs, and when a call opens the
  microphone and the headphone drops to 16 or 24 kHz?
- How much later does the sound arrive than with goui off? Is a video still in sync?
- Do the volume keys still change the real device?
- Does the permission prompt work from a signed `.app`?

### 2. A core with no Web Audio

`responseDb` asks an `OfflineAudioContext` for its curve. Bun has none. The Web Audio spec gives
the exact biquad formulas, including the shelves that take no Q and the LP and HP that read Q in
dB. Write them in `src/shared/filters.js` as plain math and draw the curve from them. The current
journeys then check that the curve still matches what Chrome plays. The fit and the auto preamp
come along unchanged.

### 3. Bridge

Bun loads the engine and plays an AutoEQ file from the command line:
`bun mac/app/play.js "Sennheiser HD 600 ParametricEQ.txt"`. The core turns the file into rows and
the engine plays them.

### 4. Window with gpuix

The Listen and Library views first. The graph comes later. The window must not need the audio
running. The audio must not need the window open.

### 5. Package

An `.app` bundle with the Info.plist key, a Developer ID signature, notarization and launch at
login. Direct download first. The Mac App Store can come later.

## Risks

- gpuix and GPUI are young and change fast. The core and the engine do not import gpuix, so the
  window can move to another toolkit.
- The tap API is documented mostly in header comments. Few examples exist beyond Apple's sample
  and insidegui/AudioCap.
- The engine language is open. Rust matches GPUI and has CoreAudio bindings through objc2. Whether
  those cover `CATapDescription` needs a check in step 1. Swift with a C interface works either way.
- A biquad below 50 Hz loses accuracy in 32-bit floats. The engine keeps its filter state in
  64-bit floats.
- The repo rules ask for journeys that end in the sound that comes out. Recording the Mac's output
  needs a loopback device. How the Mac journeys get one is open.

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
- gpuix, github.com/remorses/gpuix
- AudioCap, github.com/insidegui/AudioCap

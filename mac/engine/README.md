# goui engine

The audio path in `../PLAN.md`. It plays every sound on the Mac through a preamp and up to 32
bands, with the same filters as the extension.

`goui-engine` is the command line tool. `goui` is the same engine in a menu bar app, run by launchd.
`goui-render-check` checks the render code with no audio device.

Swift sets up the tap, the aggregate device and the listeners. The audio callback and the filters
are C, in `Sources/Render/`. Swift can allocate or retain without a sign in the code, and the audio
thread must never wait.

A new sound goes into the one of two filter chains that is not playing. The audio thread fades
from the old chain to the new one over 20 ms, so a change does not click. A change that comes
during a fade waits for it to end, and then only the newest sound goes in.

| File | What it does |
| --- | --- |
| `goui-engine/main.swift` | Reads the flags, starts the engine, prints the meters and stops on a signal |
| `goui/main.swift` | Starts the app. `--page` opens another page of `mac/web/`, such as a check |
| `goui/AppController.swift` | Owns the engine, the menu bar item with its right-click menu, and the panel |
| `goui/FloatingPanel.swift` | The panel under the menu bar item, which hides on a click elsewhere |
| `goui/WebFileServer.swift` | Serves `goui://app/` from the web files inside the app |
| `goui/Bridge.swift` | Answers the page's messages: status, meters, sound, power, response, restart, print |
| `goui/SavedConfig.swift` | The power switch and the last sound, in `~/Library/Application Support/goui/config.json` |
| `Render/Biquad.c` | The Web Audio spec's formulas for the eight filters, and each band's response |
| `Render/Render.c` | The audio callback: the two chains, the fade and the meters |
| `GouiEngine/Sound.swift` | The preamp and bands, as `toPlayedSound` makes them, checked and turned into C bands |
| `goui-render-check/main.swift` | Plays test tones through the render code and checks each gain and each fade |
| `GouiEngine/Engine.swift` | Keeps one audio path playing. It builds the path again when the output changes and tries again after a failed start. |
| `GouiEngine/AudioPath.swift` | Builds the tap, the aggregate device and the callback, and takes them down in reverse |
| `GouiEngine/PropertyListener.swift` | Listens to one Core Audio property on the main queue |
| `GouiEngine/CoreAudioProperty.swift` | Reads Core Audio properties and names their errors |
| `goui-engine/Options.swift` | Parses the flags |
| `GouiEngine/Report.swift` | Prints the summary and the meters |

## Run

```sh
swift build
.build/debug/goui-engine --gain-db -6 --bass-db 6
```

`--seconds 10` stops it on its own. Control-C stops it too. Every 2 seconds it prints the callback
rate, the peak level in and out, the count of samples above full scale, and the overload count.
`--gain-db` and `--bass-db` take -24 to 24. A wrong flag prints the usage and exits with 2.

macOS asks for System Audio Recording the first time. Run from a terminal, the prompt names the
terminal app.

### The menu bar app

```sh
App/make-app.sh
App/agent.sh start
```

`make-app.sh` builds `.build/goui.app` with `src/` and `mac/web/` inside it, and signs it ad hoc.
`agent.sh start` writes `~/Library/LaunchAgents/com.goui.app.plist` and starts it.
`agent.sh start --page mac/web/checks/bridge.html` runs the bridge check, which prints each reply to
the log. `--page mac/web/checks/biquads.html` compares the C filters with WebKit's.

### The render check

```sh
swift run -c release goui-render-check
```

It plays a tone through each kind of band and compares the gain with the band's response. Then it
changes the sound at a peak of a tone and checks that no step between two samples is larger than
the tone's own. With the fade cut to one sample, all four of those checks fail. The prompt names goui. launchd starts
the app again after a crash, and after **Quit goui** it stays quit. The meters go to
`~/Library/Logs/goui.log`. `agent.sh stop` stops the app and removes the agent.

## First results

On a MacBook Pro with macOS 27.0.1, through its speakers at 48 kHz:

- 94 callbacks a second, 512 frames each, with no overload.
- A 440 Hz tone at -40.2 dBFS came out at -40.2 dBFS. With `--gain-db -6` it came out at -46.2.
- The speakers take 12.9 ms from the tap to the ear. The engine's 512 frame buffer is 10.7 ms of it.
- On exit the tap and the aggregate device went away, and sound played the normal way again.
- By ear, YouTube in a browser tab with `--gain-db -12 --bass-db 6` played quieter with no double.
  The mute works. The tap also catches audio from the browser's helper process.
- The volume keys still change the volume of the real device.
- Stopped in the middle of playback, the music came straight back at its normal level.
- Killed with `kill -9` in the middle of playback, the music came back on its own. macOS removes
  the muted tap when the process dies.
- A Bluetooth headphone connected while it ran took over the sound, still quieter. Turned off, the
  sound went back to the speakers, still quieter. After a kill, it came back at full level each time.
- An AKG N700NC M2 played at 44.1 kHz with 161 ms of Bluetooth delay, most of it there without goui.
  A FaceTime call took it to 16 kHz with 30 ms. The gain held in both. The sound in call mode peaked
  at +1.1 dBFS, above full scale, so the EQ will need its preamp.
- The engine starts again when the sample rate of the output changes. Without that, the bass shelf
  kept the numbers for the old rate. A switch of the speakers from 48 to 44.1 kHz and back started it
  again both times.
- Turning off a Bluetooth headphone pauses the web player. macOS does that with or without goui.

## Checks by ear

1. Play music, then start the engine with `--gain-db -12`. The music gets quieter and does not
   double up. A double means the mute failed.
2. Try Safari, Chrome and Music. Chrome plays from helper processes.
3. With `--bass-db 9`, the bass rises and the voices stay where they were.
4. Plug in or connect headphones while it runs. It prints that it started again, and the sound
   moves to the headphones.
5. Press the volume keys. The volume of the real device changes.
6. Stop it with `kill -9`. Sound comes back on its own.
7. Leave it on through an hour of music and listen for clicks.

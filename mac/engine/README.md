# goui engine

A command line trial of the audio path in `../PLAN.md`. It plays every sound on the Mac through a
gain and a 105 Hz bass shelf. There is no UI and no AutoEQ yet.

Swift sets up the tap, the aggregate device and the listeners. The audio callback is C, in
`Sources/Render/`. Swift can allocate or retain without a sign in the code, and the audio thread
must never wait.

## Run

```sh
swift build
.build/debug/goui-engine --gain-db -6 --bass-db 6
```

`--seconds 10` stops it on its own. Control-C stops it too. Every 2 seconds it prints the callback
rate, the peak level in and out, and the overload count.

macOS asks for System Audio Recording the first time. Run from a terminal, the prompt names the
terminal app.

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

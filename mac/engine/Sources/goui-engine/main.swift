import Foundation
import GouiEngine

// A pipe holds printed lines until it fills, and kill -9 loses them. Each line goes out at once.
setvbuf(stdout, nil, _IOLBF, 0)
let options = Options.parse(CommandLine.arguments)
let meterEverySeconds = 2.0

print("goui engine. Gain \(options.gainDb) dB, bass \(options.bassDb) dB at 105 Hz. Press Control-C to stop.")
print("If the Mac goes quiet, allow the terminal under System Settings, Privacy & Security, Screen & System Audio Recording.")
let engine: Engine
do {
  engine = try Engine()
  try engine.setSound(options.sound)
} catch {
  print("goui engine could not start. \(error)")
  exit(1)
}
engine.start()

@MainActor
func stopAndExit() {
  engine.stop()
  print("Stopped. The Mac plays sound the normal way again.")
  exit(0)
}

let meterTimer = DispatchSource.makeTimerSource(queue: .main)
meterTimer.schedule(deadline: .now() + meterEverySeconds, repeating: meterEverySeconds)
meterTimer.setEventHandler { MainActor.assumeIsolated { engine.readMeters().map(printMeters) } }
meterTimer.resume()

let signalSources = [SIGINT, SIGTERM].map { signalNumber in
  signal(signalNumber, SIG_IGN)
  let source = DispatchSource.makeSignalSource(signal: signalNumber, queue: .main)
  source.setEventHandler { MainActor.assumeIsolated { stopAndExit() } }
  source.resume()
  return source
}

if let seconds = options.seconds {
  DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { MainActor.assumeIsolated { stopAndExit() } }
}

dispatchMain()

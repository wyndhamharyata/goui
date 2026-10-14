import AppKit
import GouiEngine

// launchd writes the log through a pipe, and kill -9 loses the lines it holds. Each line goes out at once.
setvbuf(stdout, nil, _IOLBF, 0)
let meterEverySeconds = 2.0
// For now every sound plays 6 dB quieter, so a test tone shows the engine at work.
let options = Options(gainDb: -6)

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let menu = NSMenu()
menu.addItem(withTitle: "Quit goui", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
statusItem.button?.title = "goui"
statusItem.menu = menu

print("goui. Gain \(options.gainDb) dB.")
let engine: Engine
do {
  engine = try Engine(options: options)
} catch {
  print("goui engine could not start. \(error)")
  exit(1)
}

engine.start()

let meterTimer = DispatchSource.makeTimerSource(queue: .main)
meterTimer.schedule(deadline: .now() + meterEverySeconds, repeating: meterEverySeconds)
meterTimer.setEventHandler { MainActor.assumeIsolated { engine.readMeters().map(printMeters) } }
meterTimer.resume()

let quitObserver = NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: .main) { _ in
  MainActor.assumeIsolated { engine.stop() }
}

app.run()

import AppKit

// The update items in goui's menu: the check, the twice-a-day timer, and the one click that installs a new engine.
@MainActor
final class UpdateMenu: NSObject {
  private static let automaticKey = "automaticUpdates"
  // The first check waits a minute so it does not compete with the engine's start. Then it repeats twice a day.
  private static let intervalSeconds = 12 * 60 * 60.0
  private static let firstDelaySeconds = 60.0

  private let updater = Updater()
  private let checkItem = NSMenuItem(title: "Check for Updates…", action: nil, keyEquivalent: "")
  private let updateItem = NSMenuItem(title: "Update…", action: nil, keyEquivalent: "")
  private let automaticItem = NSMenuItem(title: "Automatic updates", action: nil, keyEquivalent: "")
  private var timer: Timer?
  // The web files changed under the panel, so the app builds the page again.
  private let rebuildPanel: () -> Void

  init(rebuildPanel: @escaping () -> Void) {
    self.rebuildPanel = rebuildPanel
    super.init()

    checkItem.target = self
    checkItem.action = #selector(checkForUpdates)
    updateItem.target = self
    updateItem.action = #selector(applyUpdate)
    updateItem.isHidden = true
    automaticItem.target = self
    automaticItem.action = #selector(toggleAutomatic)
    automaticItem.state = isAutomaticOn ? .on : .off
  }

  // The items take their place in the menu, and the timer starts with them.
  func install(in menu: NSMenu) {
    menu.addItem(checkItem)
    menu.addItem(updateItem)
    menu.addItem(automaticItem)
    startTimer()
  }

  @objc private func checkForUpdates() {
    updateItem.isHidden = true
    Task { await runCheck(isManual: true) }
  }

  @objc private func applyUpdate() {
    updateItem.isHidden = true
    guard let problem = updater.installPending() else { return }

    showMessage(problem)
  }

  @objc private func toggleAutomatic() {
    let isOn = automaticItem.state != .on
    UserDefaults.standard.set(isOn, forKey: Self.automaticKey)
    automaticItem.state = isOn ? .on : .off
    startTimer()
  }

  private var isAutomaticOn: Bool {
    UserDefaults.standard.object(forKey: Self.automaticKey) as? Bool ?? true
  }

  // The automatic check never speaks. The menu shows what it found.
  private func startTimer() {
    timer?.invalidate()
    timer = nil
    guard isAutomaticOn else { return }

    let timer = Timer(timeInterval: Self.intervalSeconds, repeats: true) { [weak self] _ in
      Task { await self?.runCheck(isManual: false) }
    }
    timer.fireDate = Date().addingTimeInterval(Self.firstDelaySeconds)
    RunLoop.main.add(timer, forMode: .common)
    self.timer = timer
  }

  // A web-only release goes in at once, and a new engine waits here for the one click.
  private func runCheck(isManual: Bool) async {
    let outcome = await updater.check()
    if case .webUpdated = outcome { rebuildPanel() }
    describe(outcome, isManual: isManual)
  }

  private func describe(_ outcome: Updater.Outcome, isManual: Bool) {
    switch outcome {
    case .upToDate(let version):
      print("goui \(version) is the newest version.")
      if isManual { showMessage("goui \(version) is the newest version.") }

    case .webUpdated(let version):
      print("goui updated the web files to \(version).")
      if isManual { showMessage("goui updated the panel to \(version).") }

    case .ready(let version, _):
      updateItem.title = "Update to \(version)…"
      updateItem.isHidden = false
      print("goui \(version) is ready. The menu installs it.")
      if isManual { askToInstall(version) }

    case .failed(let reason):
      print("The update check failed. \(reason)")
      if isManual { showMessage(reason) }
    }
  }

  // A release that changes the engine starts the app again and makes macOS ask for the audio once more, so it asks first.
  private func askToInstall(_ version: String) {
    let alert = NSAlert()
    alert.messageText = "goui \(version) is ready."
    alert.informativeText = "goui updates and starts again. macOS asks once more to let goui record the audio of this Mac."
    alert.addButton(withTitle: "Update")
    alert.addButton(withTitle: "Later")
    NSApp.activate()

    if alert.runModal() == .alertFirstButtonReturn { applyUpdate() }
  }

  private func showMessage(_ message: String) {
    let alert = NSAlert()
    alert.messageText = message
    alert.addButton(withTitle: "OK")
    NSApp.activate()
    _ = alert.runModal()
  }
}

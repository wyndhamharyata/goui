import AppKit

// The update items in goui's menu and the check behind them. A web-only release goes in at once and a new engine waits for one click, since it starts the app again.
@MainActor
final class UpdateMenu: NSObject {
  private static let automaticKey = "automaticUpdates"
  // The first check waits a minute so it does not compete with the engine's start. Then it repeats twice a day.
  private static let intervalSeconds = 12 * 60 * 60.0
  private static let firstDelaySeconds = 60.0

  private let checkItem = NSMenuItem(title: "Check for Updates…", action: #selector(checkForUpdates), keyEquivalent: "")
  private let updateItem = NSMenuItem(title: "Update…", action: #selector(applyUpdate), keyEquivalent: "")
  private let automaticItem = NSMenuItem(title: "Automatic updates", action: #selector(toggleAutomatic), keyEquivalent: "")
  private var timer: Timer?
  // The unpacked newer app, kept until the menu installs it.
  private var readyAppURL: URL?
  // The web files changed under the panel, so the app builds the page again.
  private let rebuildPanel: () -> Void

  init(rebuildPanel: @escaping () -> Void) {
    self.rebuildPanel = rebuildPanel
    super.init()

    for item in [checkItem, updateItem, automaticItem] { item.target = self }
    updateItem.isHidden = true
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
    guard let readyAppURL else { return }

    do {
      try installApp(readyAppURL)
    } catch {
      showMessage("The update could not be put in place. \(error.localizedDescription)")
    }
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

  private func startTimer() {
    timer?.invalidate()
    guard isAutomaticOn else { return }

    let timer = Timer(timeInterval: Self.intervalSeconds, repeats: true) { [weak self] _ in
      Task { await self?.runCheck(isManual: false) }
    }
    timer.fireDate = Date().addingTimeInterval(Self.firstDelaySeconds)
    RunLoop.main.add(timer, forMode: .common)
    self.timer = timer
  }

  private func runCheck(isManual: Bool) async {
    let currentVersion = WebFolder.newerVersion ?? appVersion
    let upToDate = "goui \(currentVersion) is the newest version."

    if !isRunningInstalledApp {
      report(log: upToDate, message: upToDate, isManual: isManual)
      return
    }

    let release: ReleaseDownload.Release
    do {
      release = try await ReleaseDownload.readLatest()
    } catch {
      reportFailure("The update check did not reach GitHub. \(error.localizedDescription)", isManual: isManual)
      return
    }

    guard compareVersions(release.version, currentVersion) > 0 else {
      report(log: upToDate, message: upToDate, isManual: isManual)
      return
    }

    do {
      let newerAppURL = try await ReleaseDownload.bring(release)
      if try isWebOnlyChange(to: newerAppURL) {
        try WebFolder.apply(from: newerAppURL, version: release.version)
        rebuildPanel()
        report(log: "goui updated the web files to \(release.version).", message: "goui updated the panel to \(release.version).", isManual: isManual)
        return
      }

      readyAppURL = newerAppURL
      updateItem.title = "Update to \(release.version)…"
      updateItem.isHidden = false
      print("goui \(release.version) is ready. The menu installs it.")
      if isManual { askToInstall(release.version) }
    } catch {
      reportFailure(error.localizedDescription, isManual: isManual)
    }
  }

  // Two releases that share an engine differ only in their web files, which the running app reads without a restart.
  private func isWebOnlyChange(to appURL: URL) throws -> Bool {
    guard let runningURL = Bundle.main.executableURL else { return false }

    return try fileHash(appURL.appending(path: "Contents/MacOS/goui")) == fileHash(runningURL)
  }

  // The automatic check never speaks. The menu shows what it found.
  private func report(log: String, message: String, isManual: Bool) {
    print(log)
    if isManual { showMessage(message) }
  }

  private func reportFailure(_ reason: String, isManual: Bool) {
    report(log: "The update check failed. \(reason)", message: reason, isManual: isManual)
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
}

@MainActor
func showMessage(_ message: String) {
  let alert = NSAlert()
  alert.messageText = message
  alert.addButton(withTitle: "OK")
  NSApp.activate()
  _ = alert.runModal()
}

import Foundation

// Checks GitHub for a newer release and applies it: the web files alone when the engine is the same, the whole app when it is not.
@MainActor
final class Updater {
  // What a check found.
  enum Outcome {
    case upToDate(version: String)
    case webUpdated(version: String)
    case ready(version: String, app: URL)
    case failed(reason: String)
  }

  // Where install.sh puts the app, and where an updated web folder sits.
  private static let installedAppURL = FileManager.default.homeDirectoryForCurrentUser.appending(path: "Applications/goui.app")
  static let webURL = SupportFolder.file("web")
  private static let webVersionURL = SupportFolder.file("web-version")

  // The unpacked newer app, kept until the menu installs it.
  private var pendingApp: URL?

  // Only the app in ~/Applications updates itself, so a build from a checkout leaves an install alone.
  static var isInstalled: Bool {
    Bundle.main.bundleURL.standardizedFileURL.path == installedAppURL.standardizedFileURL.path
  }

  // Looks for a newer release and applies a web-only one at once.
  func check() async -> Outcome {
    let current = AppVersion.inUse
    guard Self.isInstalled else { return .upToDate(version: current) }

    let release: ReleaseDownload.Release
    do {
      release = try await ReleaseDownload.readLatest()
    } catch {
      return .failed(reason: "The update check did not reach GitHub. \(error.localizedDescription)")
    }

    if compareVersions(release.version, current) <= 0 { return .upToDate(version: current) }

    do {
      let newerApp = try await ReleaseDownload.bring(release)

      if try isWebOnlyChange(to: newerApp) {
        try applyWebFiles(from: newerApp, version: release.version)
        return .webUpdated(version: release.version)
      }

      pendingApp = newerApp
      return .ready(version: release.version, app: newerApp)
    } catch {
      return .failed(reason: error.localizedDescription)
    }
  }

  // Moves the newer app into ~/Applications and starts it again. macOS lets the running app be replaced under itself.
  func installPending() -> String? {
    guard let newerApp = pendingApp else { return "There is no update ready." }
    guard Self.isInstalled else {
      return "goui is running from \(Bundle.main.bundleURL.path), so update it with the install line."
    }

    let previousURL = Self.installedAppURL.deletingLastPathComponent().appending(path: "goui.app.previous")
    do {
      try? FileManager.default.removeItem(at: previousURL)
      try FileManager.default.moveItem(at: Self.installedAppURL, to: previousURL)
      try FileManager.default.moveItem(at: newerApp, to: Self.installedAppURL)
    } catch {
      try? FileManager.default.moveItem(at: previousURL, to: Self.installedAppURL)
      return "The update could not be put in place. \(error.localizedDescription)"
    }

    // The new app carries its own web files, so the older ones beside it go away.
    try? FileManager.default.removeItem(at: Self.webURL)
    try? FileManager.default.removeItem(at: SupportFolder.file("web.previous"))
    try? FileManager.default.removeItem(at: Self.webVersionURL)

    pendingApp = nil
    restartApp()
  }

  // Two releases that share an engine differ only in their web files, which the running app reads without a restart.
  private func isWebOnlyChange(to appURL: URL) throws -> Bool {
    guard let runningURL = Bundle.main.executableURL else { return false }

    return try fileHash(appURL.appending(path: "Contents/MacOS/goui")) == fileHash(runningURL)
  }

  // Puts the newer web files beside the app, where the panel reads them before the copies inside it.
  private func applyWebFiles(from appURL: URL, version: String) throws {
    let packedURL = appURL.appending(path: "Contents/Resources/web")
    let stagedURL = SupportFolder.file("web.new")
    let previousURL = SupportFolder.file("web.previous")

    // The copy lands beside the app first, so a failure part way through leaves the old files in use.
    try? FileManager.default.removeItem(at: stagedURL)
    try? FileManager.default.removeItem(at: Self.webVersionURL)
    try FileManager.default.copyItem(at: packedURL, to: stagedURL)

    try? FileManager.default.removeItem(at: previousURL)
    if FileManager.default.fileExists(atPath: Self.webURL.path) {
      try FileManager.default.moveItem(at: Self.webURL, to: previousURL)
    }
    try FileManager.default.moveItem(at: stagedURL, to: Self.webURL)
    try version.write(to: Self.webVersionURL, atomically: true, encoding: .utf8)
  }

  // Asks launchd for the app again, which starts the new one. The call kills this copy on its way out.
  private func restartApp() -> Never {
    let launchctl = Process()
    launchctl.executableURL = URL(fileURLWithPath: "/bin/launchctl")
    launchctl.arguments = ["kickstart", "-k", "gui/\(getuid())/com.goui.app"]

    do {
      try launchctl.run()
      launchctl.waitUntilExit()
    } catch {
      print("goui could not ask launchd to start it again. \(error)")
    }

    exit(1)
  }
}

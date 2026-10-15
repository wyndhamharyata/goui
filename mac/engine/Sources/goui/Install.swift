import Foundation

// Where install.sh puts the app. Only that copy updates itself, so a build from a checkout leaves an install alone.
let installedAppURL = FileManager.default.homeDirectoryForCurrentUser.appending(path: "Applications/goui.app")

var isRunningInstalledApp: Bool {
  Bundle.main.bundleURL.standardizedFileURL.path == installedAppURL.standardizedFileURL.path
}

var appVersion: String {
  Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
}

// Compares two dotted versions and answers 1, 0 or -1, as install.sh does.
func compareVersions(_ first: String, _ second: String) -> Int {
  let firstParts = first.split(separator: ".").map { Int($0) ?? 0 }
  let secondParts = second.split(separator: ".").map { Int($0) ?? 0 }
  let count = max(firstParts.count, secondParts.count)

  for index in 0..<count {
    let left = index < firstParts.count ? firstParts[index] : 0
    let right = index < secondParts.count ? secondParts[index] : 0
    if left != right { return left < right ? -1 : 1 }
  }

  return 0
}

// Moves the newer app into ~/Applications and starts it again. macOS lets the running app be replaced under itself.
func installApp(_ newerAppURL: URL) throws -> Never {
  _ = try FileManager.default.replaceItemAt(installedAppURL, withItemAt: newerAppURL, backupItemName: "goui.app.previous", options: .withoutDeletingBackupItem)
  // The new app carries its own web files.
  WebFolder.remove()

  // launchd starts the new app. The call kills this copy on its way out.
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

// Newer web files beside the app. The panel reads them before the copies inside it, with no restart.
enum WebFolder {
  static let url = supportFolderURL.appending(path: "web")
  private static let previousURL = supportFolderURL.appending(path: "web.previous")
  private static let versionURL = supportFolderURL.appending(path: "web-version")

  static var version: String? {
    guard let text = try? String(contentsOf: versionURL, encoding: .utf8) else { return nil }

    return text.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  // A manual install can bring newer files of its own, so the folder counts only while it is newer than the app.
  static var newerVersion: String? {
    guard let version, compareVersions(version, appVersion) > 0 else { return nil }

    return version
  }

  static var isInUse: Bool {
    isRunningInstalledApp && newerVersion != nil
  }

  // The version file goes first, so a failure part way through leaves the app's own files in use.
  static func apply(from appURL: URL, version: String) throws {
    let packedURL = appURL.appending(path: "Contents/Resources/web")
    try? FileManager.default.removeItem(at: versionURL)
    if FileManager.default.fileExists(atPath: url.path) {
      _ = try FileManager.default.replaceItemAt(url, withItemAt: packedURL, backupItemName: "web.previous", options: .withoutDeletingBackupItem)
    } else {
      try FileManager.default.moveItem(at: packedURL, to: url)
    }
    try version.write(to: versionURL, atomically: true, encoding: .utf8)
  }

  static func remove() {
    for itemURL in [url, previousURL, versionURL] { try? FileManager.default.removeItem(at: itemURL) }
  }
}

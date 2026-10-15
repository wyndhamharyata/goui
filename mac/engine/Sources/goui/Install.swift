import Foundation
import GouiEngine

// Where install.sh puts the app. Only that copy updates itself, so a build from a checkout does not touch an install.
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

// Two releases that match outside their web files differ only in what the running app reads without a restart.
func isWebOnlyChange(from oldAppURL: URL, to newAppURL: URL) throws -> Bool {
  try readBundleHashes(oldAppURL) == readBundleHashes(newAppURL)
}

// Every file of the bundle but the web files, by path, with its hash. The signature seals the web files, so it is left out too, and the executable is read with its signature taken off. Info.plist is read without the version, which every release changes.
private func readBundleHashes(_ appURL: URL) throws -> [String: String] {
  let skippedPaths: Set = ["Contents/Resources/web", "Contents/_CodeSignature"]
  let rootPath = appURL.standardizedFileURL.path + "/"
  var hashes: [String: String] = [:]

  guard let files = FileManager.default.enumerator(at: appURL, includingPropertiesForKeys: [.isRegularFileKey]) else {
    throw GouiError("goui could not read \(appURL.path).")
  }

  for case let fileURL as URL in files {
    let path = String(fileURL.standardizedFileURL.path.dropFirst(rootPath.count))
    if skippedPaths.contains(path) { files.skipDescendants() }
    guard try fileURL.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true, !skippedPaths.contains(path) else { continue }

    hashes[path] = try readComparableHash(fileURL, path: path)
  }

  return hashes
}

private func readComparableHash(_ fileURL: URL, path: String) throws -> String {
  if path == "Contents/Info.plist" { return try readInfoHash(fileURL) }
  if path.hasPrefix("Contents/MacOS/") { return try readUnsignedHash(fileURL) }

  return try fileHash(fileURL)
}

private func readInfoHash(_ fileURL: URL) throws -> String {
  let versionKeys = ["CFBundleShortVersionString", "CFBundleVersion"]
  let info = try PropertyListSerialization.propertyList(from: Data(contentsOf: fileURL), format: nil) as? [String: Any] ?? [:]
  let data = try JSONSerialization.data(withJSONObject: info.filter { !versionKeys.contains($0.key) }, options: .sortedKeys)

  return dataHash(data)
}

// codesign takes the signature off a copy, so the bytes left are the code alone.
private func readUnsignedHash(_ fileURL: URL) throws -> String {
  let copyURL = FileManager.default.temporaryDirectory.appending(path: "goui-unsigned-\(UUID().uuidString)")
  defer { try? FileManager.default.removeItem(at: copyURL) }

  try FileManager.default.copyItem(at: fileURL, to: copyURL)
  try run("/usr/bin/codesign", ["--remove-signature", copyURL.path], failure: "goui could not read the code of \(fileURL.lastPathComponent).")

  return try fileHash(copyURL)
}

// Runs a tool and waits for it. A tool that exits with an error throws the failure given.
func run(_ toolPath: String, _ arguments: [String], failure: String) throws {
  let tool = Process()
  tool.executableURL = URL(fileURLWithPath: toolPath)
  tool.arguments = arguments

  try tool.run()
  tool.waitUntilExit()

  guard tool.terminationStatus == 0 else { throw GouiError(failure) }
}

// Moves the newer app into ~/Applications and starts it again. macOS lets the running app be replaced under itself.
func installApp(_ newerAppURL: URL) throws -> Never {
  _ = try FileManager.default.replaceItemAt(installedAppURL, withItemAt: newerAppURL, backupItemName: "goui.app.previous", options: .withoutDeletingBackupItem)
  // The new app carries its own web files.
  WebFolder.remove()

  // launchd starts the new app. The call kills this copy on its way out.
  do {
    try run("/bin/launchctl", ["kickstart", "-k", "gui/\(getuid())/\(agentLabel)"], failure: "launchctl refused the restart.")
  } catch {
    print("goui could not ask launchd to start it again. \(error)")
  }

  exit(1)
}

// Newer web files beside the app. The panel reads them before the copies inside it, with no restart.
enum WebFolder {
  static var version: String? {
    guard let text = try? String(contentsOf: SupportFile.webVersionURL, encoding: .utf8) else { return nil }

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

  // The version file goes first, so a failure part way through keeps the app's own files in use.
  static func apply(from appURL: URL, version: String) throws {
    let packedURL = appURL.appending(path: "Contents/Resources/web")
    try? FileManager.default.removeItem(at: SupportFile.webVersionURL)

    if FileManager.default.fileExists(atPath: SupportFile.webURL.path) {
      _ = try FileManager.default.replaceItemAt(SupportFile.webURL, withItemAt: packedURL, backupItemName: "web.previous", options: .withoutDeletingBackupItem)
    } else {
      try FileManager.default.moveItem(at: packedURL, to: SupportFile.webURL)
    }

    try version.write(to: SupportFile.webVersionURL, atomically: true, encoding: .utf8)
  }

  static func remove() {
    for itemURL in [SupportFile.webURL, SupportFile.previousWebURL, SupportFile.webVersionURL] { try? FileManager.default.removeItem(at: itemURL) }
  }
}

import Foundation

// Which goui is in use. An updated web folder can be newer than the app that holds it.
enum AppVersion {
  // The app's own version, from the Info.plist inside it.
  static var app: String {
    Bundle.main.object(forInfoDictionaryKey: bundleVersionKey) as? String ?? "0.0.0"
  }

  // The version an app bundle holds, from the Info.plist inside it.
  static func version(of appURL: URL) -> String? {
    Bundle(url: appURL)?.object(forInfoDictionaryKey: bundleVersionKey) as? String
  }

  // The version of the web files beside the app, written when they were put there.
  static var web: String? {
    guard let text = try? String(contentsOf: path, encoding: .utf8) else { return nil }

    return text.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  // A web folder is in use only while it is newer than the app, as a manual install can bring newer files of its own.
  static var hasNewerWeb: Bool {
    guard let web else { return false }

    return compareVersions(web, app) > 0
  }

  // The version the panel is showing.
  static var inUse: String {
    guard hasNewerWeb, let web else { return app }

    return web
  }

  private static let bundleVersionKey = "CFBundleShortVersionString"
  private static let path = SupportFolder.file("web-version")
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

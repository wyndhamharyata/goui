import CryptoKit
import Foundation
import GouiEngine

// Reads the newest release from GitHub and brings a verified copy of it in.
enum ReleaseDownload {
  // The release GitHub marks as Latest, and where a test points the check instead.
  private static let latestReleaseURL = URL(string: "https://api.github.com/repos/wyndhamharyata/goui/releases/latest")!
  private static let feedOverrideKey = "GOUI_UPDATE_FEED"
  private static let tarballName = "goui-mac.tar.gz"
  private static let githubAccept = "application/vnd.github+json"

  struct Release {
    let version: String
    let tarballURL: URL
    let checksumsURL: URL
  }

  // Reads the feed for the newest release, or the file a test names in GOUI_UPDATE_FEED.
  static func readLatest() async throws -> Release {
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    let feed = try await decoder.decode(Feed.self, from: read(feedURL()))

    return Release(
      version: String(feed.tagName.trimmingPrefix("v")),
      tarballURL: try feed.asset(where: { $0 == tarballName }, orThrow: "The newest release holds no \(tarballName)."),
      checksumsURL: try feed.asset(where: { $0.hasSuffix("-sha256.txt") }, orThrow: "The newest release holds no checksums file.")
    )
  }

  // Downloads the release, compares it with its published hash and unpacks the app. release.mjs already checked its version.
  static func bring(_ release: Release) async throws -> URL {
    let workURL = FileManager.default.temporaryDirectory.appending(path: "goui-update-\(release.version)-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: workURL, withIntermediateDirectories: true)

    let tarballURL = workURL.appending(path: tarballName)
    try await read(release.tarballURL).write(to: tarballURL, options: .atomic)
    try await verify(tarballURL, with: release.checksumsURL)
    try unpack(tarballURL, to: workURL)

    let appURL = workURL.appending(path: "goui.app")
    try checkSystemRequirement(of: appURL)

    return appURL
  }

  // Compares the tarball with the hash the release publishes beside it.
  private static func verify(_ tarballURL: URL, with checksumsURL: URL) async throws {
    let text = String(decoding: try await read(checksumsURL), as: UTF8.self)

    guard let expected = hash(of: tarballName, in: text) else {
      throw GouiError("The checksums file names no \(tarballName).")
    }
    guard try fileHash(tarballURL) == expected else {
      throw GouiError("The download does not match its checksum, so goui did not use it.")
    }
  }

  // The app is packed with tar, so tar unpacks it.
  private static func unpack(_ tarballURL: URL, to folderURL: URL) throws {
    let tar = Process()
    tar.executableURL = URL(fileURLWithPath: "/usr/bin/tar")
    tar.arguments = ["-xzf", tarballURL.path, "-C", folderURL.path]
    try tar.run()
    tar.waitUntilExit()

    guard tar.terminationStatus == 0 else {
      throw GouiError("The download could not be unpacked.")
    }
  }

  // A release can ask for a newer macOS than this Mac runs.
  private static func checkSystemRequirement(of appURL: URL) throws {
    guard let required = Bundle(url: appURL)?.object(forInfoDictionaryKey: "LSMinimumSystemVersion") as? String else { return }

    if compareVersions(required, systemVersion) > 0 {
      throw GouiError("The release needs macOS \(required).")
    }
  }

  // GOUI_UPDATE_FEED points the check at a made-up release, so a test needs no release of its own.
  private static func feedURL() -> URL {
    guard let override = ProcessInfo.processInfo.environment[feedOverrideKey], !override.isEmpty else { return latestReleaseURL }

    if let url = URL(string: override), url.scheme != nil { return url }

    return URL(fileURLWithPath: override)
  }

  // Reads a URL, or a file when the feed or an asset is a local path.
  private static func read(_ url: URL) async throws -> Data {
    if url.isFileURL { return try Data(contentsOf: url) }

    var request = URLRequest(url: url)
    request.timeoutInterval = 20
    if url.host == "api.github.com" { request.setValue(githubAccept, forHTTPHeaderField: "Accept") }

    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw GouiError("The update server refused \(url.lastPathComponent).")
    }

    return data
  }

  // shasum writes a hash, two spaces, then the file name.
  private static func hash(of name: String, in checksums: String) -> String? {
    for line in checksums.split(separator: "\n") {
      let fields = line.split(separator: " ", omittingEmptySubsequences: true)
      if fields.count == 2, fields[1] == name { return String(fields[0]) }
    }

    return nil
  }

  private static var systemVersion: String {
    let version = ProcessInfo.processInfo.operatingSystemVersion

    return "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)"
  }

  // The part of GitHub's release JSON that a check reads.
  private struct Feed: Decodable {
    let tagName: String
    let assets: [Asset]

    struct Asset: Decodable {
      let name: String
      let browserDownloadUrl: URL
    }

    func asset(where isWanted: (String) -> Bool, orThrow message: String) throws -> URL {
      guard let asset = assets.first(where: { isWanted($0.name) }) else { throw GouiError(message) }

      return asset.browserDownloadUrl
    }
  }
}

// The sha256 of a file, in the same form the release's checksums file holds it.
func fileHash(_ url: URL) throws -> String {
  SHA256.hash(data: try Data(contentsOf: url)).map { String(format: "%02x", $0) }.joined()
}

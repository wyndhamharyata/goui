import CryptoKit
import Foundation

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
    let data = try await read(feedURL())
    let feed = try JSONDecoder().decode(Feed.self, from: data)
    let version = feed.tagName.hasPrefix("v") ? String(feed.tagName.dropFirst()) : feed.tagName

    guard let tarball = feed.assets.first(where: { $0.name == tarballName }) else {
      throw UpdateError(message: "The newest release holds no \(tarballName).")
    }
    guard let checksums = feed.assets.first(where: { $0.name.hasSuffix("-sha256.txt") }) else {
      throw UpdateError(message: "The newest release holds no checksums file.")
    }

    return Release(version: version, tarballURL: tarball.url, checksumsURL: checksums.url)
  }

  // Downloads the release, compares it with its published hash and unpacks the app.
  static func bring(_ release: Release) async throws -> URL {
    let workURL = FileManager.default.temporaryDirectory.appending(path: "goui-update-\(release.version)-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: workURL, withIntermediateDirectories: true)

    let tarballURL = workURL.appending(path: tarballName)
    try await fetch(release.tarballURL, to: tarballURL)
    try await verify(tarballURL, with: release.checksumsURL)

    let unpackedURL = workURL.appending(path: "unpacked")
    try FileManager.default.createDirectory(at: unpackedURL, withIntermediateDirectories: true)
    try unpack(tarballURL, to: unpackedURL)

    let appURL = unpackedURL.appending(path: "goui.app")
    try checkVersion(of: appURL, is: release.version)
    try checkSystemRequirement(of: appURL)

    return appURL
  }

  // Compares the tarball with the hash the release publishes beside it.
  private static func verify(_ tarballURL: URL, with checksumsURL: URL) async throws {
    let text = String(decoding: try await read(checksumsURL), as: UTF8.self)

    guard let expected = hash(of: tarballName, in: text) else {
      throw UpdateError(message: "The checksums file names no \(tarballName).")
    }
    guard try fileHash(tarballURL) == expected else {
      throw UpdateError(message: "The download does not match its checksum, so goui did not use it.")
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
      throw UpdateError(message: "The download could not be unpacked.")
    }
  }

  private static func checkVersion(of appURL: URL, is version: String) throws {
    guard AppVersion.version(of: appURL) == version else {
      throw UpdateError(message: "The release holds another version than its tag.")
    }
  }

  // A release can ask for a newer macOS than this Mac runs.
  private static func checkSystemRequirement(of appURL: URL) throws {
    guard let required = Bundle(url: appURL)?.object(forInfoDictionaryKey: "LSMinimumSystemVersion") as? String else { return }

    if compareVersions(required, systemVersion) > 0 {
      throw UpdateError(message: "The release needs macOS \(required).")
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
    try checkResponse(response, for: url)

    return data
  }

  // Saves a download where the unpack step reads it.
  private static func fetch(_ url: URL, to destinationURL: URL) async throws {
    try await read(url).write(to: destinationURL, options: .atomic)
  }

  private static func checkResponse(_ response: URLResponse, for url: URL) throws {
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw UpdateError(message: "The update server refused \(url.lastPathComponent).")
    }
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
      let url: URL

      enum CodingKeys: String, CodingKey {
        case name
        case url = "browser_download_url"
      }
    }

    enum CodingKeys: String, CodingKey {
      case tagName = "tag_name"
      case assets
    }
  }
}

// The sha256 of a file, in the same form the release's checksums file holds it.
func fileHash(_ url: URL) throws -> String {
  SHA256.hash(data: try Data(contentsOf: url)).map { String(format: "%02x", $0) }.joined()
}

private struct UpdateError: LocalizedError {
  let message: String

  var errorDescription: String? { message }
}

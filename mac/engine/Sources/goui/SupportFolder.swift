import Foundation

// The one folder goui keeps for a person: the saved config, the panel's storage and the updated web files.
enum SupportFolder {
  static let url = FileManager.default.homeDirectoryForCurrentUser.appending(path: "Library/Application Support/goui")

  static func file(_ name: String) -> URL {
    url.appending(path: name)
  }

  // The folder is made on the way, as the first run has none yet.
  static func write(_ data: Data, to fileURL: URL) throws {
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    try data.write(to: fileURL, options: .atomic)
  }
}

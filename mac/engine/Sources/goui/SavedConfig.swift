import Foundation

struct Band: Codable {
  var on: Bool
  var type: String
  var frequencyHz: Double
  var gainDb: Double
  var q: Double
}

// What toPlayedSound in src/shared/config.js gives: the EQ switch, the preamp and every band that plays.
struct PlayedSound: Codable {
  var enabled: Bool
  var preampDb: Double
  var bands: [Band]
}

// The power switch and the last sound. They play again from login, before any window opens.
struct SavedConfig: Codable {
  static let fileURL = FileManager.default.homeDirectoryForCurrentUser.appending(path: "Library/Application Support/goui/config.json")

  var isOn = true
  var sound = PlayedSound(enabled: true, preampDb: 0, bands: [])

  // Only the preamp plays until the biquads come in. With the EQ switch off, the sound plays as it is.
  var playedGainDb: Double {
    sound.enabled ? sound.preampDb : 0
  }

  static func read() -> SavedConfig {
    guard let data = try? Data(contentsOf: fileURL) else { return SavedConfig() }

    do {
      return try JSONDecoder().decode(SavedConfig.self, from: data)
    } catch {
      print("The config file could not be read, so goui starts from the default. \(error)")
      return SavedConfig()
    }
  }

  func write() {
    do {
      try FileManager.default.createDirectory(at: Self.fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
      try JSONEncoder().encode(self).write(to: Self.fileURL, options: .atomic)
    } catch {
      print("The config file could not be written. \(error)")
    }
  }
}

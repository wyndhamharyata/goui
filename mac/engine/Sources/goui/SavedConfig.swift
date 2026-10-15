import Foundation
import GouiEngine

// The one folder goui keeps for a person. AppController makes it at start.
let supportFolderURL = FileManager.default.homeDirectoryForCurrentUser.appending(path: "Library/Application Support/goui")

// What toPlayedSound in src/shared/config.js gives: the EQ switch, the preamp and every band that plays.
struct PlayedSound: Codable {
  var enabled: Bool
  var preampDb: Double
  var bands: [Band]
}

// The power switch and the last sound. They play again from login, before any window opens.
struct SavedConfig: Codable {
  static let fileURL = supportFolderURL.appending(path: "config.json")

  var isOn = true
  var sound = PlayedSound(enabled: true, preampDb: 0, bands: [])

  // With the EQ switch off, the sound plays as it is.
  var playedSound: Sound {
    sound.enabled ? Sound(preampDb: sound.preampDb, bands: sound.bands) : .flat
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
      try JSONEncoder().encode(self).write(to: Self.fileURL, options: .atomic)
    } catch {
      print("The config file could not be written. \(error)")
    }
  }
}

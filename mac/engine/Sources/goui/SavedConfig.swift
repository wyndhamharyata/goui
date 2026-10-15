import Foundation
import GouiEngine

// What toPlayedSound in src/shared/config.js gives: the EQ switch, the preamp and every band that plays.
struct PlayedSound: Codable {
  var enabled: Bool
  var preampDb: Double
  var bands: [Band]
}

// The power switch and the last sound. They play again from login, before any window opens.
struct SavedConfig: Codable {
  static let fileURL = SupportFolder.file("config.json")

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
      try SupportFolder.write(JSONEncoder().encode(self), to: Self.fileURL)
    } catch {
      print("The config file could not be written. \(error)")
    }
  }
}

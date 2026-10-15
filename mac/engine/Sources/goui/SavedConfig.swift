import Foundation
import GouiEngine

// The power switch and the sound of the config the panel stored. They play again from login, before any window opens.
struct SavedConfig: Codable {
  var isOn = true
  var sound = Sound.flat

  static func read() -> SavedConfig {
    guard let data = try? Data(contentsOf: SupportFile.configURL) else { return SavedConfig() }

    do {
      return try JSONDecoder().decode(SavedConfig.self, from: data)
    } catch {
      print("The config file could not be read, so goui starts from the default. \(error)")
      return SavedConfig()
    }
  }

  func write() {
    do {
      try JSONEncoder().encode(self).write(to: SupportFile.configURL, options: .atomic)
    } catch {
      print("The config file could not be written. \(error)")
    }
  }
}

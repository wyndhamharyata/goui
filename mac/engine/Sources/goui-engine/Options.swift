import Foundation
import GouiEngine

struct Options {
  static let maxLevelDb = 24.0
  static let usage = "Usage: goui-engine [--gain-db -24...24] [--bass-db -24...24] [--seconds N]"

  var gainDb = 0.0
  var bassDb = 0.0
  var seconds: Double?

  static func parse(_ arguments: [String]) -> Options {
    var options = Options()
    var remaining = arguments.dropFirst()
    while let flag = remaining.popFirst() {
      guard let text = remaining.popFirst(), let value = Double(text), value.isFinite else { exitWithUsage() }
      let isLevelInRange = abs(value) <= maxLevelDb
      switch flag {
      case "--gain-db" where isLevelInRange: options.gainDb = value
      case "--bass-db" where isLevelInRange: options.bassDb = value
      case "--seconds" where value > 0: options.seconds = value
      default: exitWithUsage()
      }
    }
    return options
  }

  // The bass is a low shelf at 105 Hz, the corner AutoEQ and the Bass slider use.
  var sound: Sound {
    let bass = Band(type: "LSC", frequencyHz: 105, gainDb: bassDb, q: 0.71)
    return Sound(preampDb: gainDb, bands: bassDb == 0 ? [] : [bass])
  }

  private static func exitWithUsage() -> Never {
    FileHandle.standardError.write(Data((usage + "\n").utf8))
    exit(2)
  }
}

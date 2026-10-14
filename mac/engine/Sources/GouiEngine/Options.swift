import Foundation

public struct Options {
  static let maxLevelDb = 24.0
  static let usage = "Usage: goui-engine [--gain-db -24...24] [--bass-db -24...24] [--seconds N]"

  public var gainDb: Double
  public var bassDb: Double
  public var seconds: Double?

  public init(gainDb: Double = 0, bassDb: Double = 0, seconds: Double? = nil) {
    self.gainDb = gainDb
    self.bassDb = bassDb
    self.seconds = seconds
  }

  public static func parse(_ arguments: [String]) -> Options {
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

  private static func exitWithUsage() -> Never {
    FileHandle.standardError.write(Data((usage + "\n").utf8))
    exit(2)
  }
}

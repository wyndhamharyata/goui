// swift-tools-version: 6.2
import Foundation
import PackageDescription

// The permission prompt reads an Info.plist. A command line tool has no bundle, so it is linked in.
let infoPlistPath = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Info.plist").path

let package = Package(
  name: "goui-engine",
  platforms: [.macOS(.v26)],
  targets: [
    .target(name: "Render"),
    .executableTarget(
      name: "goui-engine",
      dependencies: ["Render"],
      linkerSettings: [.unsafeFlags(["-Xlinker", "-sectcreate", "-Xlinker", "__TEXT", "-Xlinker", "__info_plist", "-Xlinker", infoPlistPath])]
    ),
  ]
)

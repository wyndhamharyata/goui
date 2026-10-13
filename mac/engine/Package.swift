// swift-tools-version: 6.2
import Foundation
import PackageDescription

// The prompt for system audio reads its text from an Info.plist. A command line tool has no bundle,
// so the linker puts the plist inside the binary.
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

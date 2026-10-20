import Foundation

// The one folder goui keeps for a person, and each file in it. mac/install.sh and mac/goui name the same files.
enum SupportFile {
  static let folderURL = FileManager.default.homeDirectoryForCurrentUser.appending(path: "Library/Application Support/goui")
  static let configURL = folderURL.appending(path: "config.json")
  static let storageURL = folderURL.appending(path: "storage.json")
  static let autoEqIndexURL = folderURL.appending(path: "autoeq-index.json")
  static let webURL = folderURL.appending(path: "web")
  static let previousWebURL = folderURL.appending(path: "web.previous")
  static let webVersionURL = folderURL.appending(path: "web-version")
  // install.sh writes it after an install or an update, so the panel opens once and shows where goui lives.
  static let installedMarkerURL = folderURL.appending(path: "just-installed")
  // The folder holds nothing but the request, so its watch wakes only when goui set writes one.
  static let setRequestFolderURL = folderURL.appending(path: "set-requests")
  static let setRequestURL = setRequestFolderURL.appending(path: "set-request")

  // The answer to one goui set, named by the id the command gave its request.
  static func setResultURL(id: String) -> URL {
    folderURL.appending(path: "set-result-\(id)")
  }
}

// launchd knows goui by this label. mac/install.sh, mac/goui and App/agent.sh write the same one.
let agentLabel = "com.goui.app"

// The guide pages in the panel are written for Chrome, so the Mac opens its own page on the homepage.
let guideURL = URL(string: "https://goui.mwyndham.dev/mac")!

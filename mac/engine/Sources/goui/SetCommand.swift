import Foundation

// What happened to a Set's name. The page gives the first four, as setAnswers in src/panel/sets.js names them. mac/goui reads every one.
enum SetAnswer: String {
  case applied, unknown, tooManyBands, refused
  // The page never got ready, so the Set did not play.
  case notReady
  // A newer pick came before the page was ready, and only the newest plays.
  case replaced
}

// A Set to play, from the menu or from goui set. A request from goui set carries the id its answer goes back under.
struct SetRequest {
  let name: String
  let commandID: String?
}

// goui set moves a request into its own folder. The app takes it away at once, so the command knows the app heard it. Then the app writes the answer.
@MainActor
final class SetCommand {
  // A request older than this was left by a command that gave up, such as one from before a restart.
  private static let maxRequestAgeSeconds = 5.0
  private static let idCharacters = Set("0123456789-")

  private let onRequest: (SetRequest) -> Void
  private var source: DispatchSourceFileSystemObject?

  init(onRequest: @escaping (SetRequest) -> Void) {
    self.onRequest = onRequest
  }

  // The command moves the file into place, which writes to the folder, so one watch on the folder sees each request.
  func start() {
    let folderURL = SupportFile.setRequestFolderURL

    try? FileManager.default.createDirectory(at: folderURL, withIntermediateDirectories: true)
    let folder = open(folderURL.path, O_EVTONLY)
    guard folder >= 0 else {
      print("goui cannot watch \(folderURL.path), so goui set does not reach it.")
      return
    }

    let source = DispatchSource.makeFileSystemObjectSource(fileDescriptor: folder, eventMask: .write, queue: .main)
    source.setEventHandler { [weak self] in
      MainActor.assumeIsolated { self?.takeRequest() }
    }
    source.setCancelHandler { close(folder) }
    source.resume()
    self.source = source
    takeRequest()
  }

  // The command waits for this file and exits on its first line. The Set names follow an unknown name, so the command can list them.
  static func writeResult(_ answer: SetAnswer, names: [String], commandID: String) {
    let text = ([answer.rawValue] + names).joined(separator: "\n") + "\n"

    do {
      try text.write(to: SupportFile.setResultURL(id: commandID), atomically: true, encoding: .utf8)
    } catch {
      print("The answer to goui set could not be written. \(error)")
    }
  }

  private func takeRequest() {
    let url = SupportFile.setRequestURL
    guard let data = try? Data(contentsOf: url) else { return }

    let modifiedAt = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
    try? FileManager.default.removeItem(at: url)

    guard Date().timeIntervalSince(modifiedAt) <= Self.maxRequestAgeSeconds else {
      print("goui set left a request from \(modifiedAt), so goui did not play it.")
      return
    }
    guard let request = Self.toRequest(data) else {
      print("goui set wrote a request goui cannot read.")
      return
    }

    onRequest(request)
  }

  // The command writes its id on the first line and the name on the second. The id names the result file, so it holds only digits and dashes.
  private static func toRequest(_ data: Data) -> SetRequest? {
    let lines = String(decoding: data, as: UTF8.self).split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false)
    guard lines.count == 2, let id = lines.first, !id.isEmpty, id.allSatisfy(idCharacters.contains) else { return nil }

    return SetRequest(name: String(lines[1]), commandID: String(id))
  }
}

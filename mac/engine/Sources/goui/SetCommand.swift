import Foundation

// goui set writes a Set's name to a file in the support folder. The app takes the file away, so the command knows the app heard it.
@MainActor
final class SetCommand {
  static let requestURL = supportFolderURL.appending(path: "set-request")

  private let onRequest: (String) -> Void
  private var source: DispatchSourceFileSystemObject?

  init(onRequest: @escaping (String) -> Void) {
    self.onRequest = onRequest
  }

  // The command moves the file into place, which writes to the folder, so one watch on the folder sees each request.
  func start() {
    let folder = open(supportFolderURL.path, O_EVTONLY)
    guard folder >= 0 else {
      print("goui cannot watch \(supportFolderURL.path), so goui set does not reach it.")
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

  private func takeRequest() {
    guard let data = try? Data(contentsOf: Self.requestURL) else { return }

    try? FileManager.default.removeItem(at: Self.requestURL)
    onRequest(String(decoding: data, as: UTF8.self))
  }
}

import UniformTypeIdentifiers
import WebKit

// The web folders the panel reads, in order. The first folder holding a file serves it.
struct WebRoots {
  let folders: [URL]

  // A path that climbs out of a folder is refused. nil when no folder holds the file.
  func file(atPath path: String) -> URL? {
    for folder in folders {
      let rootURL = folder.standardizedFileURL
      let fileURL = rootURL.appending(path: path).standardizedFileURL
      if fileURL.path.hasPrefix(rootURL.path + "/"), FileManager.default.fileExists(atPath: fileURL.path) { return fileURL }
    }

    return nil
  }
}

// Serves goui://app/<path> from those folders, and nothing outside them.
@MainActor
final class WebFileServer: NSObject, WKURLSchemeHandler {
  static let scheme = "goui"
  static let host = "app"

  private let roots: WebRoots

  init(roots: WebRoots) {
    self.roots = roots
  }

  func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
    guard let url = task.request.url, url.host == Self.host, let fileURL = roots.file(atPath: url.path), let data = try? Data(contentsOf: fileURL) else {
      task.didFailWithError(URLError(.fileDoesNotExist))
      return
    }

    let mimeType = UTType(filenameExtension: fileURL.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
    let headers = ["Content-Type": mimeType, "Content-Length": "\(data.count)"]
    task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers) ?? URLResponse())
    task.didReceive(data)
    task.didFinish()
  }

  func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}
}

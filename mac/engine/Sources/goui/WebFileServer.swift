import UniformTypeIdentifiers
import WebKit

// Serves goui://app/<path> from the web folder inside the app, and nothing outside it.
@MainActor
final class WebFileServer: NSObject, WKURLSchemeHandler {
  static let scheme = "goui"
  static let host = "app"

  private let rootURL: URL

  init(rootURL: URL) {
    self.rootURL = rootURL.standardizedFileURL
  }

  func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
    guard let url = task.request.url, let fileURL = findFile(url), let data = try? Data(contentsOf: fileURL) else {
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

  private func findFile(_ url: URL) -> URL? {
    guard url.host == Self.host else { return nil }

    let fileURL = rootURL.appending(path: url.path).standardizedFileURL
    return fileURL.path.hasPrefix(rootURL.path + "/") ? fileURL : nil
  }
}

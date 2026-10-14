import AppKit
import GouiEngine
import WebKit

// Owns the engine, the menu bar item, the panel and its page.
@MainActor
final class AppController: NSObject, WKNavigationDelegate {
  nonisolated static let shellPagePath = "mac/web/shell.html"
  private static let panelSize = NSSize(width: 400, height: 600)
  // The click on the menu bar item that hides the panel would open it again straight away.
  private static let reopenDelaySeconds = 0.3

  private let pagePath: String
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  private let menu = NSMenu()
  private var engine: Engine?
  private var bridge: Bridge?
  private var webView: WKWebView?
  private var panel: FloatingPanel?

  init(pagePath: String) {
    self.pagePath = pagePath
  }

  func start() {
    let config = SavedConfig.read()
    let engine: Engine
    do {
      engine = try Engine(options: Options(gainDb: config.playedGainDb))
    } catch {
      print("goui engine could not start. \(error)")
      exit(1)
    }

    let bridge = Bridge(engine: engine, config: config)
    engine.onStatusChange = { _ in bridge.sendStatus() }
    self.engine = engine
    self.bridge = bridge
    print("goui. \(config.isOn ? "On" : "Off"), preamp \(config.playedGainDb) dB.")
    if config.isOn { engine.start() }

    buildMenu()
    statusItem.button?.title = "goui"
    statusItem.button?.target = self
    statusItem.button?.action = #selector(clickMenuBarItem)
    statusItem.button?.sendAction(on: [.leftMouseUp, .rightMouseUp])
    if pagePath != Self.shellPagePath { togglePanel() }
  }

  private func buildMenu() {
    menu.addItem(withTitle: "Restart engine", action: #selector(restartEngine), keyEquivalent: "").target = self
    menu.addItem(withTitle: "Reload panel", action: #selector(reloadPanel), keyEquivalent: "").target = self
    menu.addItem(.separator())
    menu.addItem(withTitle: "Quit goui", action: #selector(quit), keyEquivalent: "q").target = self
  }

  @objc private func clickMenuBarItem() {
    guard let button = statusItem.button else { return }

    let event = NSApp.currentEvent
    let isMenuClick = event?.type == .rightMouseUp || event?.modifierFlags.contains(.control) == true
    if isMenuClick {
      menu.popUp(positioning: nil, at: NSPoint(x: 0, y: button.bounds.height + 4), in: button)
    } else {
      togglePanel()
    }
  }

  private func togglePanel() {
    guard let button = statusItem.button else { return }

    let panel = panel ?? buildPanel()
    let wasJustHidden = Date().timeIntervalSince(panel.lastHiddenAt) < Self.reopenDelaySeconds
    if panel.isVisible {
      panel.orderOut(nil)
    } else if !wasJustHidden {
      panel.show(below: button)
    }
  }

  private func buildPanel() -> FloatingPanel {
    let webView = buildWebView()
    let panel = FloatingPanel(contentView: webView, size: Self.panelSize)
    self.webView = webView
    self.panel = panel
    return panel
  }

  private func buildWebView() -> WKWebView {
    let configuration = WKWebViewConfiguration()
    let webRootURL = Bundle.main.resourceURL?.appending(path: "web") ?? URL(fileURLWithPath: "/nonexistent")
    configuration.setURLSchemeHandler(WebFileServer(rootURL: webRootURL), forURLScheme: WebFileServer.scheme)
    if let bridge { configuration.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: Bridge.name) }

    let webView = WKWebView(frame: NSRect(origin: .zero, size: Self.panelSize), configuration: configuration)
    webView.navigationDelegate = self
    webView.isInspectable = true
    bridge?.webView = webView
    loadPage(in: webView)
    return webView
  }

  private func loadPage(in webView: WKWebView) {
    guard let url = URL(string: "\(WebFileServer.scheme)://\(WebFileServer.host)/\(pagePath)") else { return }

    webView.load(URLRequest(url: url))
  }

  // goui's own pages open in the panel. Any other link opens in the default browser.
  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
    guard let url = action.request.url, url.scheme != WebFileServer.scheme else {
      decisionHandler(.allow)
      return
    }

    if url.scheme == "https" || url.scheme == "http" { NSWorkspace.shared.open(url) }
    decisionHandler(.cancel)
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    print("The panel's page stopped. Loading it again.")
    loadPage(in: webView)
  }

  @objc private func restartEngine() {
    engine?.restart(reason: "Restart engine was chosen in the menu.")
  }

  @objc private func reloadPanel() {
    guard let webView else { return }

    loadPage(in: webView)
  }

  @objc private func quit() {
    engine?.stop()
    NSApp.terminate(nil)
  }
}

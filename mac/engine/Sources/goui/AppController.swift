import AppKit
import GouiEngine
import WebKit

// Owns the engine, the menu bar item, the panel and its page.
@MainActor
final class AppController: NSObject, WKNavigationDelegate, NSMenuDelegate {
  // The panel opens as the popup of one stand-in tab, so it shows its power button.
  nonisolated static let panelPagePath = "src/panel.html?tab=1"
  private static let chromePath = "mac/web/chrome.js"
  private static let panelSize = NSSize(width: FloatingPanel.narrowWidthPx, height: 600)
  // At 900 px src/panel.css shows Listen, Tune and Library side by side.
  private static let wideWidthPx = 900.0
  // Wide panel opens at a width a Chrome side panel can take too, so both show the same three columns.
  private static let wideOpenWidthPx = 1100.0
  private static let widthKey = "panelWidth"
  private static let guideURL = URL(string: "https://goui.mwyndham.dev/mac")!
  // The click on the menu bar item that hides the panel would open it again straight away.
  private static let reopenDelaySeconds = 0.3
  // install.sh writes this after an install or an update, so the panel opens once and shows where goui lives.
  private static let installedMarkerURL = supportFolderURL.appending(path: "just-installed")

  private let pagePath: String
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  private let menu = NSMenu()
  private let wideItem = NSMenuItem(title: "Wide panel", action: #selector(toggleWide), keyEquivalent: "")
  private let setsSeparator = NSMenuItem.separator()
  private let setsItem = NSMenuItem(title: "Sets", action: nil, keyEquivalent: "")
  private let engine: Engine
  private let bridge: Bridge
  private var panel: FloatingPanel?
  private var isOpeningAfterInstall = false
  // The last answer from the page, so the tick shows at once while the page answers again.
  private var playingSetName = ""
  private lazy var updateMenu = UpdateMenu { [weak self] in self?.rebuildPanelAfterUpdate() }
  private lazy var setCommand = SetCommand { [weak self] name in self?.applySet(named: name) }

  init(pagePath: String) {
    try? FileManager.default.createDirectory(at: supportFolderURL, withIntermediateDirectories: true)
    let config = SavedConfig.read()
    do {
      engine = try Engine()
    } catch {
      print("goui engine could not start. \(error)")
      exit(1)
    }
    bridge = Bridge(engine: engine, config: config)
    self.pagePath = pagePath
    super.init()

    do {
      try engine.setSound(config.playedSound)
    } catch {
      print("The saved sound cannot play, so goui plays the sound as it is. \(error)")
    }

    engine.onStatusChange = { [weak self, bridge] status in
      bridge.sendStatus()
      self?.openPanelOnceStarted(status)
    }
    print("goui. \(config.isOn ? "On" : "Off"), preamp \(config.playedSound.preampDb) dB, \(config.playedSound.bands.count) bands.")
    if config.isOn { engine.start() }
  }

  func start() {
    buildMenu()
    configureStatusItem()
    setCommand.start()
    isOpeningAfterInstall = takeInstalledMarker()
    if pagePath != Self.panelPagePath { togglePanel() }
    openPanelOnceStarted(engine.status)
  }

  private func configureStatusItem() {
    // A template image takes the menu bar's own colour, in light mode and dark.
    let menuBarIcon = Bundle.main.image(forResource: "menu-bar")
    menuBarIcon?.isTemplate = true

    statusItem.button?.image = menuBarIcon
    statusItem.button?.title = menuBarIcon == nil ? "goui" : ""
    statusItem.button?.setAccessibilityLabel("goui")
    statusItem.button?.toolTip = "goui. Click for the panel, right-click for the menu."
    statusItem.button?.target = self
    statusItem.button?.action = #selector(clickMenuBarItem)
    statusItem.button?.sendAction(on: [.leftMouseUp, .rightMouseUp])
  }

  // Building the tap gives the focus back to the app in front, which would hide the panel, so it opens after.
  private func openPanelOnceStarted(_ status: Engine.Status) {
    guard isOpeningAfterInstall, status != .starting else { return }

    isOpeningAfterInstall = false
    togglePanel()
  }

  private func takeInstalledMarker() -> Bool {
    (try? FileManager.default.removeItem(at: Self.installedMarkerURL)) != nil
  }

  private func buildMenu() {
    menu.addItem(withTitle: "About goui", action: #selector(showAbout), keyEquivalent: "").target = self
    menu.addItem(.separator())
    menu.addItem(withTitle: "Restart engine", action: #selector(restartEngine), keyEquivalent: "").target = self
    menu.addItem(withTitle: "Reload panel", action: #selector(reloadPanel), keyEquivalent: "").target = self
    wideItem.target = self
    wideItem.state = UserDefaults.standard.double(forKey: Self.widthKey) >= Self.wideWidthPx ? .on : .off
    menu.addItem(wideItem)
    menu.addItem(setsSeparator)
    setsItem.submenu = NSMenu()
    menu.addItem(setsItem)
    menu.addItem(.separator())
    updateMenu.install(in: menu)
    menu.addItem(.separator())
    menu.addItem(withTitle: "Quit goui", action: #selector(quit), keyEquivalent: "q").target = self
    menu.delegate = self
  }

  // The panel saves and deletes Sets, so the submenu is built again each time the menu opens.
  func menuNeedsUpdate(_ menu: NSMenu) {
    let names = bridge.storage.listSetNames()
    setsItem.isHidden = names.isEmpty
    setsSeparator.isHidden = names.isEmpty
    setsItem.submenu?.items = names.map(buildSetItem)
    guard !names.isEmpty else { return }

    renderSetTicks()
    // Only the page can tell which Set plays, so it loads now if it has not, and the tick follows its answer.
    if panel == nil { _ = buildPanel() }
    Task { await readPlayingSet() }
  }

  private func buildSetItem(named name: String) -> NSMenuItem {
    let item = NSMenuItem(title: name, action: #selector(pickSet), keyEquivalent: "")
    item.target = self
    item.representedObject = name
    return item
  }

  private func renderSetTicks() {
    for item in setsItem.submenu?.items ?? [] {
      item.state = item.representedObject as? String == playingSetName ? .on : .off
    }
  }

  private func readPlayingSet() async {
    guard let name = await bridge.readPlayingSetName() else { return }

    playingSetName = name
    renderSetTicks()
  }

  @objc private func pickSet(_ item: NSMenuItem) {
    guard let name = item.representedObject as? String else { return }

    applySet(named: name)
  }

  // The menu and goui set both apply through the page, which loads first if the panel was never opened.
  private func applySet(named name: String) {
    if panel == nil { _ = buildPanel() }

    Task {
      switch await bridge.applySet(named: name) {
      case .applied:
        playingSetName = name
        print("goui plays the Set \(name).")
      case .unknown:
        showMessage("goui has no Set called \(name). Pick one from the Sets menu, or save it in the panel first.")
      case .notReady:
        showMessage("The panel did not load, so the Set \(name) did not play. Pick Reload panel and try again.")
      }
    }
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
    let savedWidth = UserDefaults.standard.double(forKey: Self.widthKey)
    let size = NSSize(width: max(savedWidth, FloatingPanel.narrowWidthPx), height: Self.panelSize.height)
    let panel = FloatingPanel(contentView: webView, size: size)
    bridge.onResize = { [weak panel] height in panel?.resize(toHeight: height) }
    panel.onWidthChange = { [weak self] width in self?.keepWidth(width) }
    self.panel = panel
    return panel
  }

  // The panel reads an updated web folder when the app runs from ~/Applications, so a build run from anywhere else keeps its own files.
  private func webRoots() -> WebRoots {
    var folders: [URL] = []

    if WebFolder.isInUse { folders.append(WebFolder.url) }
    if let bundledURL = Bundle.main.resourceURL?.appending(path: "web") { folders.append(bundledURL) }

    return WebRoots(folders: folders)
  }

  private func buildWebView() -> WKWebView {
    let configuration = WKWebViewConfiguration()
    let roots = webRoots()
    configuration.setURLSchemeHandler(WebFileServer(roots: roots), forURLScheme: WebFileServer.scheme)
    configuration.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: Bridge.name)

    // The Chrome stand-in runs before the panel's own code, which reads chrome as it loads.
    if let chromeURL = roots.file(atPath: Self.chromePath), let chromeSource = try? String(contentsOf: chromeURL, encoding: .utf8) {
      configuration.userContentController.addUserScript(WKUserScript(source: chromeSource, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    } else {
      print("\(Self.chromePath) is missing from the app, so the panel cannot reach goui.")
    }

    let webView = WKWebView(frame: NSRect(origin: .zero, size: Self.panelSize), configuration: configuration)
    webView.navigationDelegate = self
    webView.isInspectable = true
    // The panel's own background shows from the first frame, with no white flash before it loads.
    webView.underPageBackgroundColor = .black
    webView.setValue(false, forKey: "drawsBackground")
    bridge.webView = webView
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

  private func keepWidth(_ width: Double) {
    let isWide = width >= Self.wideWidthPx
    UserDefaults.standard.set(width, forKey: Self.widthKey)
    wideItem.state = isWide ? .on : .off
  }

  @objc private func toggleWide() {
    guard let button = statusItem.button else { return }

    let panel = panel ?? buildPanel()
    let isWide = panel.frame.width >= Self.wideWidthPx
    panel.setWidth(isWide ? FloatingPanel.narrowWidthPx : Self.wideOpenWidthPx)
    if !panel.isVisible { panel.show(below: button) }
  }

  // The name, icon and version come from the bundle. The credits add what goui is and where its guide lives.
  @objc private func showAbout() {
    let credits = NSMutableAttributedString(string: "An EQ for every sound on your Mac. AutoEQ tunes it to your headphone, and EQByEar to your ear.\n\n")
    if let webVersion = WebFolder.version, webVersion != appVersion {
      credits.append(NSAttributedString(string: "The panel runs goui \(webVersion).\n\n"))
    }
    credits.append(NSAttributedString(string: "goui.mwyndham.dev/mac", attributes: [.link: Self.guideURL]))
    credits.addAttributes([.font: NSFont.systemFont(ofSize: NSFont.smallSystemFontSize), .foregroundColor: NSColor.labelColor], range: NSRange(location: 0, length: credits.length))
    // A menu bar app is never in front on its own, so the About window would open behind other windows.
    NSApp.activate()
    NSApp.orderFrontStandardAboutPanel(options: [.credits: credits])
  }

  @objc private func restartEngine() {
    engine.restart(reason: "Restart engine was chosen in the menu.")
  }

  @objc private func reloadPanel() {
    guard let webView = panel?.contentView as? WKWebView else { return }

    loadPage(in: webView)
  }

  // The web files changed under the panel, so the next open builds the page again, stand-in and all.
  private func rebuildPanelAfterUpdate() {
    guard let oldPanel = panel else { return }

    let wasVisible = oldPanel.isVisible
    oldPanel.orderOut(nil)
    panel = nil

    guard wasVisible, let button = statusItem.button else { return }

    buildPanel().show(below: button)
  }

  @objc private func quit() {
    engine.stop()
    NSApp.terminate(nil)
  }
}

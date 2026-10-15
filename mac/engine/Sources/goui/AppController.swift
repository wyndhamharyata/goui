import AppKit
import GouiEngine
import WebKit

// Owns the engine, the menu bar item, the panel and its page.
@MainActor
final class AppController: NSObject, WKNavigationDelegate, NSMenuDelegate {
  // The panel opens as the popup of one stand-in tab, so it shows its power button.
  nonisolated static let panelPagePath = "src/panel.html?tab=1"
  private static let chromePath = "mac/web/chrome.js"
  private static let panelHeightPx = 600.0
  // Wide panel opens at a width a Chrome side panel can take too, so both show the same three columns.
  private static let wideOpenWidthPx = 1100.0
  private static let widthKey = "panelWidth"
  // The click on the menu bar item that hides the panel would open it again straight away.
  private static let reopenDelaySeconds = 0.3
  // The space between the menu bar item and the menu that opens under it.
  private static let menuGapPx = 4.0
  // --ink-1 in src/base.css, the panel's own background, so the first frame shows no white flash before the page loads.
  private static let pageBackgroundColor = NSColor(srgbRed: 14 / 255, green: 16 / 255, blue: 19 / 255, alpha: 1)

  private let pagePath: String
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  private let menu = NSMenu()
  private let setsMenu = NSMenu()
  private let engine: Engine
  private let bridge: Bridge
  private var panel: FloatingPanel?
  private var isOpeningAfterInstall = false
  // The page's last answer, so the submenu shows at once while the page answers again. nil until the page first answers.
  private var setList: SetList?
  private var setListRead: Task<Void, Never>?
  // One Set waits to play at a time, and a newer pick takes its place.
  private var pendingSet: SetRequest?
  private var setApplying: Task<Void, Never>?
  private lazy var updateMenu = UpdateMenu { [weak self] in self?.rebuildPanelAfterUpdate() }
  private lazy var setCommand = SetCommand { [weak self] request in self?.applySet(request) }

  init(pagePath: String) {
    try? FileManager.default.createDirectory(at: SupportFile.folderURL, withIntermediateDirectories: true)
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
      try engine.setSound(config.sound)
    } catch {
      print("The saved sound cannot play, so goui plays the sound as it is. \(error)")
    }

    engine.onStatusChange = { [weak self, bridge] status in
      bridge.sendStatus()
      self?.openPanelOnceStarted(status)
    }
    print("goui. \(config.isOn ? "On" : "Off"), preamp \(config.sound.preampDb) dB, \(config.sound.bands.count) bands.")
    if config.isOn { engine.start() }
  }

  func start() {
    buildMenu()
    renderStatusItem()
    setCommand.start()
    isOpeningAfterInstall = takeInstalledMarker()
    if pagePath != Self.panelPagePath { togglePanel() }
    openPanelOnceStarted(engine.status)
    // The menu and goui set read the page, so it loads just after launch, outside any menu tracking.
    DispatchQueue.main.async { [weak self] in _ = self?.readPanel() }
  }

  private func renderStatusItem() {
    // A template image takes the menu bar's own colour, in light mode and dark.
    let menuBarIcon = Bundle.main.image(forResource: "menu-bar")
    menuBarIcon?.isTemplate = true

    statusItem.button?.image = menuBarIcon
    statusItem.button?.title = menuBarIcon == nil ? "goui" : ""
    statusItem.button?.setAccessibilityLabel("goui")
    statusItem.button?.toolTip = "goui. Click to open the panel. Right-click for the menu."
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
    (try? FileManager.default.removeItem(at: SupportFile.installedMarkerURL)) != nil
  }

  // The order of the mock in design/ux-proposals.html.
  private func buildMenu() {
    menu.addItem(buildItem("About goui", #selector(showAbout)))
    menu.addItem(.separator())

    menu.addItem(buildItem("Restart engine", #selector(restartEngine)))
    menu.addItem(buildItem("Reload panel", #selector(reloadPanel)))
    menu.addItem(buildItem("Wide panel", #selector(toggleWide)))
    menu.addItem(.separator())

    let setsItem = NSMenuItem(title: "Sets", action: nil, keyEquivalent: "")
    setsItem.submenu = setsMenu
    menu.addItem(setsItem)
    menu.addItem(.separator())

    updateMenu.install(in: menu)
    menu.addItem(.separator())

    menu.addItem(buildItem("Quit goui", #selector(quit), keyEquivalent: "q"))
    menu.delegate = self
    renderSetsMenu()
  }

  private func buildItem(_ title: String, _ action: Selector, keyEquivalent: String = "") -> NSMenuItem {
    let item = NSMenuItem(title: title, action: action, keyEquivalent: keyEquivalent)
    item.target = self

    return item
  }

  // The panel saves and deletes Sets, so the submenu shows the last answer at once and asks the page again.
  func menuNeedsUpdate(_ menu: NSMenu) {
    renderSetsMenu()
    readSetList()
  }

  private func renderSetsMenu() {
    setsMenu.items = buildSetItems()
  }

  // With no Sets, the submenu says where to save one, so a new person finds it.
  private func buildSetItems() -> [NSMenuItem] {
    guard let setList else { return [buildNoteItem("Sets show once the panel loads.")] }
    guard !setList.names.isEmpty else { return [buildNoteItem("No Sets yet. Save one in the panel under Library, then Sets.")] }

    return setList.names.map { name in
      let item = buildItem(name, #selector(pickSet))
      item.representedObject = name
      item.state = name == setList.playingName ? .on : .off

      return item
    }
  }

  private func buildNoteItem(_ title: String) -> NSMenuItem {
    let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
    item.isEnabled = false

    return item
  }

  // One read at a time. A menu opened during a read shows that read's answer when it comes.
  private func readSetList() {
    guard setListRead == nil else { return }

    setListRead = Task {
      if let newList = await bridge.readSetList() {
        setList = newList
        renderSetsMenu()
      }
      setListRead = nil
    }
  }

  @objc private func pickSet(_ item: NSMenuItem) {
    guard let name = item.representedObject as? String else { return }

    applySet(SetRequest(name: name, commandID: nil))
  }

  // The newest request wins. The wait for the page is shared, so requests made while it loads cannot play out of order.
  private func applySet(_ request: SetRequest) {
    if let replaced = pendingSet { finishSet(replaced, answer: .replaced, names: []) }
    pendingSet = request
    guard setApplying == nil else { return }

    setApplying = Task {
      let isReady = await bridge.waitForPage()

      while let next = pendingSet {
        pendingSet = nil
        await applyNow(next, isReady: isReady)
      }
      setApplying = nil
    }
  }

  private func applyNow(_ request: SetRequest, isReady: Bool) async {
    let answer = isReady ? await bridge.applySet(named: request.name) : .notReady
    let isListWanted = answer == .applied || answer == .unknown

    if isListWanted, let newList = await bridge.readSetList() { setList = newList }

    finishSet(request, answer: answer, names: setList?.names ?? [])
  }

  // goui set hears the answer in its result file, and the log keeps it. A pick from the menu shows any failure in an alert.
  private func finishSet(_ request: SetRequest, answer: SetAnswer, names: [String]) {
    print("The Set \(request.name) from \(request.commandID == nil ? "the menu" : "goui set"): \(answer.rawValue).")
    renderSetsMenu()

    if let commandID = request.commandID {
      SetCommand.writeResult(answer, names: names, commandID: commandID)
      return
    }

    if let message = toMenuMessage(answer, name: request.name) { showMessage(message) }
  }

  private func toMenuMessage(_ answer: SetAnswer, name: String) -> String? {
    switch answer {
    case .applied, .replaced: nil
    case .unknown: "goui has no Set called \(name). Pick one from the Sets menu or save it in the panel."
    case .tooManyBands: "The Set \(name) has more bands than goui plays at once. Open the Sets tab in the panel for details."
    case .refused: "The engine refused the Set \(name). The log at ~/Library/Logs/goui.log has details."
    case .notReady: "The panel has not loaded. Pick Reload panel, then try the Set again."
    }
  }

  @objc private func clickMenuBarItem() {
    guard let button = statusItem.button else { return }

    let event = NSApp.currentEvent
    let isMenuClick = event?.type == .rightMouseUp || event?.modifierFlags.contains(.control) == true

    if isMenuClick {
      menu.popUp(positioning: nil, at: NSPoint(x: 0, y: button.bounds.height + Self.menuGapPx), in: button)
    } else {
      togglePanel()
    }
  }

  private func togglePanel() {
    guard let button = statusItem.button else { return }

    let panel = readPanel()
    let wasJustHidden = Date().timeIntervalSince(panel.lastHiddenAt) < Self.reopenDelaySeconds

    if panel.isVisible {
      panel.orderOut(nil)
    } else if !wasJustHidden {
      panel.show(below: button)
    }
  }

  // The panel and its page, built the first time anything asks for them.
  private func readPanel() -> FloatingPanel {
    if let panel { return panel }

    let savedWidthPx = UserDefaults.standard.double(forKey: Self.widthKey)
    let size = NSSize(width: max(savedWidthPx, FloatingPanel.narrowWidthPx), height: Self.panelHeightPx)
    let newPanel = FloatingPanel(contentView: buildWebView(), size: size)

    bridge.onResize = { [weak newPanel] heightPx in newPanel?.resize(toHeight: heightPx) }
    newPanel.onWidthChange = { widthPx in UserDefaults.standard.set(widthPx, forKey: Self.widthKey) }
    panel = newPanel

    return newPanel
  }

  // The panel reads an updated web folder when the app runs from ~/Applications, so a build run from anywhere else keeps its own files.
  private func webRoots() -> WebRoots {
    var folders: [URL] = []

    if WebFolder.isInUse { folders.append(SupportFile.webURL) }
    if let bundledURL = Bundle.main.resourceURL?.appending(path: "web") { folders.append(bundledURL) }

    return WebRoots(folders: folders)
  }

  private func buildWebView() -> WKWebView {
    let configuration = WKWebViewConfiguration()
    let roots = webRoots()

    configuration.setURLSchemeHandler(WebFileServer(roots: roots), forURLScheme: WebFileServer.scheme)
    configuration.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: Bridge.messageHandlerName)

    // The Chrome stand-in runs before the panel's own code, which reads chrome as it loads.
    if let chromeURL = roots.file(atPath: Self.chromePath), let chromeSource = try? String(contentsOf: chromeURL, encoding: .utf8) {
      configuration.userContentController.addUserScript(WKUserScript(source: chromeSource, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    } else {
      print("\(Self.chromePath) is missing from the app, so the panel cannot reach goui.")
    }

    let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: FloatingPanel.narrowWidthPx, height: Self.panelHeightPx), configuration: configuration)

    webView.navigationDelegate = self
    webView.isInspectable = true
    webView.underPageBackgroundColor = Self.pageBackgroundColor
    webView.setValue(false, forKey: "drawsBackground")
    bridge.webView = webView
    loadPage(in: webView)

    return webView
  }

  private func loadPage(in webView: WKWebView) {
    guard let url = URL(string: "\(WebFileServer.scheme)://\(WebFileServer.host)/\(pagePath)") else { return }

    bridge.forgetPage()
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

  // Wide panel opens the panel wide, and a second pick takes it back to narrow. A small screen fits it to its width.
  @objc private func toggleWide() {
    guard let button = statusItem.button else { return }

    let panel = readPanel()
    let isWide = panel.frame.width >= panel.toFittedWidth(Self.wideOpenWidthPx)

    panel.setWidth(isWide ? FloatingPanel.narrowWidthPx : Self.wideOpenWidthPx)
    if !panel.isVisible { panel.show(below: button) }
  }

  // The name, icon and version come from the bundle. The credits add what goui is and where its guide lives.
  @objc private func showAbout() {
    let credits = NSMutableAttributedString(string: "An EQ for every sound on your Mac. AutoEQ corrects your headphone. EQByEar tunes to your hearing.\n\n")
    let guideText = (guideURL.host() ?? "") + guideURL.path()

    if let webVersion = WebFolder.version, webVersion != appVersion {
      credits.append(NSAttributedString(string: "The panel runs goui \(webVersion).\n\n"))
    }

    credits.append(NSAttributedString(string: guideText, attributes: [.link: guideURL]))
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

  // The web files changed under the panel, so the page is built again, stand-in and all. It is built at once, so the menu and goui set keep working.
  private func rebuildPanelAfterUpdate() {
    guard let oldPanel = panel else { return }

    let wasVisible = oldPanel.isVisible

    oldPanel.orderOut(nil)
    panel = nil

    let newPanel = readPanel()
    guard wasVisible, let button = statusItem.button else { return }

    newPanel.show(below: button)
  }

  @objc private func quit() {
    engine.stop()
    NSApp.terminate(nil)
  }
}

import AppKit

// Floats under the menu bar item, takes typing without bringing goui to the front, and hides on a click elsewhere.
final class FloatingPanel: NSPanel, NSWindowDelegate {
  // The popup width the extension's panel is made for, as .popup body in src/panel.css.
  static let narrowWidthPx = 400.0
  private static let gapPx = 6.0
  // As --radius-3 in src/base.css, the radius of the panel's largest cards.
  private static let cornerRadiusPx = 14.0

  // Called only when the width changes, not on each change of height the page asks for.
  var onWidthChange: ((Double) -> Void)?
  private(set) var lastHiddenAt = Date.distantPast
  private var reportedWidthPx: Double

  init(contentView: NSView, size: NSSize) {
    reportedWidthPx = Double(size.width)
    super.init(contentRect: NSRect(origin: .zero, size: size), styleMask: [.nonactivatingPanel, .borderless, .resizable], backing: .buffered, defer: false)
    delegate = self
    minSize = NSSize(width: Self.narrowWidthPx, height: 1)
    isFloatingPanel = true
    level = .statusBar
    collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
    hidesOnDeactivate = false
    isOpaque = false
    backgroundColor = .clear
    hasShadow = true

    contentView.wantsLayer = true
    contentView.layer?.cornerRadius = Self.cornerRadiusPx
    contentView.layer?.masksToBounds = true
    self.contentView = contentView
  }

  override var canBecomeKey: Bool { true }

  override func resignKey() {
    super.resignKey()
    orderOut(nil)
    lastHiddenAt = Date()
  }

  // A drag on an edge changes only the width. The height follows the page.
  func windowWillResize(_ sender: NSWindow, to frameSize: NSSize) -> NSSize {
    NSSize(width: frameSize.width, height: frame.height)
  }

  func windowDidResize(_ notification: Notification) {
    let widthPx = Double(frame.width)
    guard widthPx != reportedWidthPx else { return }

    reportedWidthPx = widthPx
    onWidthChange?(widthPx)
  }

  // The width the panel takes for this one, kept on the screen.
  func toFittedWidth(_ widthPx: Double) -> Double {
    let visibleFrame = screen?.visibleFrame ?? frame

    return min(max(widthPx, Self.narrowWidthPx), Double(visibleFrame.width) - (2 * Self.gapPx))
  }

  // Keeps the middle and the top edge where they are, and stays on the screen.
  func setWidth(_ widthPx: Double) {
    let newWidthPx = toFittedWidth(widthPx)
    var newFrame = frame

    newFrame.origin.x = centredX(on: Double(frame.midX), width: newWidthPx, in: screen)
    newFrame.size.width = newWidthPx
    setFrame(newFrame, display: true)
  }

  // The left edge that centres a panel of this width on x, kept on the screen.
  private func centredX(on x: Double, width: Double, in screen: NSScreen?) -> Double {
    let visibleFrame = screen?.visibleFrame ?? frame
    let leftmostX = Double(visibleFrame.minX) + Self.gapPx
    let rightmostX = Double(visibleFrame.maxX) - width - Self.gapPx

    return min(max(x - (width / 2), leftmostX), rightmostX)
  }

  // Keeps the top edge where it is, and stays on the screen.
  func resize(toHeight height: Double) {
    let maxHeight = (screen.map { Double($0.visibleFrame.height) } ?? height) - (2 * Self.gapPx)
    let newHeight = min(height, maxHeight)

    guard newHeight != frame.height else { return }

    var newFrame = frame

    newFrame.origin.y = frame.maxY - newHeight
    newFrame.size.height = newHeight
    setFrame(newFrame, display: true)
  }

  func show(below button: NSStatusBarButton) {
    guard let buttonWindow = button.window, let screen = buttonWindow.screen else { return }

    let buttonFrame = buttonWindow.convertToScreen(button.convert(button.bounds, to: nil))
    let x = centredX(on: Double(buttonFrame.midX), width: Double(frame.width), in: screen)

    setFrameOrigin(NSPoint(x: x, y: buttonFrame.minY - frame.height - Self.gapPx))
    // Until goui is the active app, macOS can hand the focus back to the app in front, which hides the panel.
    NSApp.activate()
    makeKeyAndOrderFront(nil)
  }
}

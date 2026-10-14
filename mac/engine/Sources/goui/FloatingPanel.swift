import AppKit

// Floats under the menu bar item, takes typing without bringing goui to the front, and hides on a click elsewhere.
final class FloatingPanel: NSPanel {
  private static let gapPx = 6.0
  private static let cornerRadiusPx = 12.0

  private(set) var lastHiddenAt = Date.distantPast

  init(contentView: NSView, size: NSSize) {
    super.init(contentRect: NSRect(origin: .zero, size: size), styleMask: [.nonactivatingPanel, .borderless], backing: .buffered, defer: false)
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

  override var canBecomeKey: Bool {
    true
  }

  override func resignKey() {
    super.resignKey()
    orderOut(nil)
    lastHiddenAt = Date()
  }

  // Keeps the top edge where it is, and stays on the screen.
  func resize(toHeight height: Double) {
    let maxHeight = (screen.map { Double($0.visibleFrame.height) } ?? height) - (2 * Self.gapPx)
    let newHeight = min(height, maxHeight)
    var newFrame = frame
    newFrame.origin.y = frame.maxY - newHeight
    newFrame.size.height = newHeight
    setFrame(newFrame, display: true)
  }

  func show(below button: NSStatusBarButton) {
    guard let buttonWindow = button.window, let screen = buttonWindow.screen else { return }

    let buttonFrame = buttonWindow.convertToScreen(button.convert(button.bounds, to: nil))
    let visibleFrame = screen.visibleFrame
    let leftmostX = visibleFrame.minX + Self.gapPx
    let rightmostX = visibleFrame.maxX - frame.width - Self.gapPx
    let x = min(max(buttonFrame.midX - (frame.width / 2), leftmostX), rightmostX)

    setFrameOrigin(NSPoint(x: x, y: buttonFrame.minY - frame.height - Self.gapPx))
    makeKeyAndOrderFront(nil)
  }
}

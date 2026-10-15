import AppKit

// launchd writes the log through a pipe, and kill -9 loses the lines it holds. Each line goes out at once.
setvbuf(stdout, nil, _IOLBF, 0)

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
app.mainMenu = buildEditMenu()
let controller = AppController(pagePath: readPagePath(CommandLine.arguments))
controller.start()
app.run()

// --page opens another page, such as a check in mac/web/checks, in place of the panel.
func readPagePath(_ arguments: [String]) -> String {
  guard let flagIndex = arguments.firstIndex(of: "--page"), flagIndex + 1 < arguments.count else { return AppController.panelPagePath }
  return arguments[flagIndex + 1]
}

// A menu bar app shows no main menu, but its key equivalents still reach the panel's text fields.
func buildEditMenu() -> NSMenu {
  let edit = NSMenu(title: "Edit")
  edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
  edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
  edit.addItem(.separator())
  edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
  edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
  edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
  edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

  let editItem = NSMenuItem(title: "Edit", action: nil, keyEquivalent: "")
  editItem.submenu = edit

  let menu = NSMenu()
  menu.addItem(NSMenuItem(title: "goui", action: nil, keyEquivalent: ""))
  menu.addItem(editItem)

  return menu
}

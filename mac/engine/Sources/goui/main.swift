import AppKit

// launchd writes the log through a pipe, and kill -9 loses the lines it holds. Each line goes out at once.
setvbuf(stdout, nil, _IOLBF, 0)

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let controller = AppController(pagePath: readPagePath(CommandLine.arguments))
controller.start()
app.run()

// --page opens another page, such as a check in mac/web/checks, in place of the panel.
func readPagePath(_ arguments: [String]) -> String {
  guard let flagIndex = arguments.firstIndex(of: "--page"), flagIndex + 1 < arguments.count else { return AppController.panelPagePath }
  return arguments[flagIndex + 1]
}

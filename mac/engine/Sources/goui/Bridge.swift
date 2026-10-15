import GouiEngine
import WebKit

// Each message the page sends, as macMessageTypes in mac/web/bridge.js names it.
private enum MessageType: String {
  case status, meters, sound, keepSound, power, response, open, openGuide, size, print
  case storageGet = "storage:get"
  case storageSet = "storage:set"
  case storageRemove = "storage:remove"
}

// Each event the app sends to the page, as macEventTypes in mac/web/bridge.js names it.
private enum EventType: String {
  case status
}

// A message from the page. type names it, and the other fields belong to that type.
private struct Request: Decodable {
  let type: String
  let isOn: Bool?
  let sound: Sound?
  let text: String?
  let band: Band?
  let sampleRateHz: Double?
  let frequenciesHz: [Double]?
  let url: String?
  let height: Double?
}

// The panel's Sets in its own order, and the one that plays, or "" when none does.
struct SetList {
  var names: [String]
  var playingName: String
}

// Answers the page's messages and sends it events. Only pages served by goui reach it.
@MainActor
final class Bridge: NSObject, WKScriptMessageHandlerWithReply {
  // The name the page posts to, as window.webkit.messageHandlers.goui in mac/web/bridge.js.
  static let messageHandlerName = "goui"
  static let maxFrequencyCount = 1000
  // The version of gouiSets in src/panel/sets.js this app speaks. A web-only update that changes it is refused, with a line in the log.
  private static let pageVersion = 1
  // The page reads its Sets as it starts. The wait asks every quarter second, for up to 15 seconds.
  private static let pageRetryDelaySeconds = 0.25
  private static let pageTryCount = 60

  weak var webView: WKWebView?
  var onResize: ((Double) -> Void)?
  private let storage = WebStorage()
  private let engine: Engine
  private var config: SavedConfig
  // One wait for the page, shared by every caller until the page loads again.
  private var pageWait: Task<Bool, Never>?

  init(engine: Engine, config: SavedConfig) {
    self.engine = engine
    self.config = config
  }

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
    guard message.frameInfo.securityOrigin.protocol == WebFileServer.scheme else {
      replyHandler(nil, "goui takes messages only from its own pages")
      return
    }

    do {
      replyHandler(try answer(message.body), nil)
    } catch {
      replyHandler(nil, "\(error)")
    }
  }

  func sendStatus() {
    let detail: [String: Any] = ["type": EventType.status.rawValue, "status": toStatus()]

    webView?.callAsyncJavaScript("window.dispatchEvent(new CustomEvent(\"goui\", { detail }))", arguments: ["detail": detail], in: nil, in: .page)
  }

  // The page loads again, so its gouiSets has to be found again.
  func forgetPage() {
    pageWait?.cancel()
    pageWait = nil
  }

  // Every caller shares one wait. A wait that gave up lets the next caller start a new one.
  func waitForPage() async -> Bool {
    let wait = pageWait ?? Task { await self.findPage() }
    pageWait = wait

    let isReady = await wait.value
    if !isReady, pageWait == wait { pageWait = nil }

    return isReady
  }

  // The panel owns the sound math, so a Set plays through the page's own applySet in src/panel/sets.js. It answers once the engine took the sound.
  func applySet(named name: String) async -> SetAnswer {
    guard await waitForPage() else { return .notReady }

    let reply = try? await webView?.callAsyncJavaScript("return await gouiSets.applySet(name)", arguments: ["name": name], in: nil, contentWorld: .page)

    return (reply as? String).flatMap(SetAnswer.init) ?? .notReady
  }

  // nil when the page never got ready, since only the page can list the Sets and tell which one plays.
  func readSetList() async -> SetList? {
    guard await waitForPage() else { return nil }

    let script = "return { names: gouiSets.listSetNames(), playingName: gouiSets.readPlayingSetName() }"
    let reply = try? await webView?.callAsyncJavaScript(script, arguments: [:], in: nil, contentWorld: .page)
    guard let reply = reply as? [String: Any], let names = reply["names"] as? [String], let playingName = reply["playingName"] as? String else { return nil }

    return SetList(names: names, playingName: playingName)
  }

  // A page that is still loading has no gouiSets yet, or throws while it navigates, so the app asks again.
  private func findPage() async -> Bool {
    for _ in 0..<Self.pageTryCount {
      let reply = try? await webView?.callAsyncJavaScript("return window.gouiSets?.version ?? null", arguments: [:], in: nil, contentWorld: .page)
      if let version = reply as? Int { return isPageVersionKnown(version) }
      guard !Task.isCancelled else { return false }

      try? await Task.sleep(for: .seconds(Self.pageRetryDelaySeconds))
    }

    return false
  }

  private func isPageVersionKnown(_ version: Int) -> Bool {
    guard version == Self.pageVersion else {
      print("The panel's gouiSets is version \(version), and this app speaks version \(Self.pageVersion). The menu and goui set cannot play Sets until both match. Run the install line again.")
      return false
    }

    return true
  }

  private func answer(_ body: Any) throws -> Any? {
    if let storageAnswer = try answerStorage(body) { return storageAnswer }

    let request = try JSONDecoder().decode(Request.self, from: JSONSerialization.data(withJSONObject: body))
    guard let type = MessageType(rawValue: request.type) else { throw GouiError("goui has no message called \(request.type)") }

    switch type {
    case .status:
      return toStatus()
    case .meters:
      return engine.readMeters().map { toMeters($0, scope: engine.readScope()) }
    case .sound:
      guard let sound = request.sound else { throw GouiError("A sound message needs a sound") }

      try engine.setSound(sound)
      return nil
    case .keepSound:
      guard let sound = request.sound else { throw GouiError("A keepSound message needs a sound") }

      config.sound = sound
      config.write()
      return nil
    case .power:
      guard let isOn = request.isOn else { throw GouiError("A power message needs isOn") }

      config.isOn = isOn
      config.write()
      if isOn { engine.start() } else { engine.stop() }
      return nil
    case .response:
      return try answerResponse(request)
    case .open:
      guard let text = request.url, let url = URL(string: text), url.scheme == "https" || url.scheme == "http" else {
        throw GouiError("An open message needs a web address")
      }

      NSWorkspace.shared.open(url)
      return nil
    case .openGuide:
      NSWorkspace.shared.open(guideURL)
      return nil
    case .size:
      guard let height = request.height, height.isFinite, height > 0 else { throw GouiError("A size message needs a height above 0") }

      onResize?(height)
      return nil
    case .print:
      print("Page: \(request.text ?? "")")
      return nil
    // answerStorage answers these before the request is decoded.
    case .storageGet, .storageSet, .storageRemove:
      return nil
    }
  }

  private func answerResponse(_ request: Request) throws -> [Double] {
    guard let band = request.band, let sampleRateHz = request.sampleRateHz, let frequenciesHz = request.frequenciesHz, frequenciesHz.count <= Self.maxFrequencyCount else {
      throw GouiError("A response message needs a band, a sampleRateHz and up to \(Self.maxFrequencyCount) frequenciesHz")
    }

    return try bandResponse(band, sampleRateHz: sampleRateHz, frequenciesHz: frequenciesHz)
  }

  // Storage items can hold any JSON, so these messages are read by hand. Returns nil for any other message.
  private func answerStorage(_ body: Any) throws -> Any? {
    guard let message = body as? [String: Any], let type = (message["type"] as? String).flatMap(MessageType.init) else { return nil }

    let keys = message["keys"] as? [String]

    switch type {
    case .storageGet:
      return storage.read(keys)
    case .storageSet:
      guard let items = message["items"] as? [String: Any] else { throw GouiError("A storage:set message needs items") }

      try storage.write(items)
    case .storageRemove:
      storage.remove(keys ?? [])
    default:
      return nil
    }

    return NSNull()
  }

  private func toStatus() -> [String: String] {
    switch engine.status {
    case .stopped: ["state": "stopped"]
    case .starting: ["state": "starting"]
    case .running: ["state": "running"]
    case .waitingToRetry(let lastError): ["state": "waitingToRetry", "lastError": lastError]
    }
  }

  // The scope goes as base64 of its Float32 bytes, far smaller and quicker than 8192 numbers.
  private func toMeters(_ reading: MeterReading, scope: ScopeReading?) -> [String: Any] {
    var meters: [String: Any] = [
      "callbacksPerSecond": reading.callbacksPerSecond,
      "inputPeakDb": linearToDbfs(reading.inputPeakLinear) as Any,
      "outputPeakDb": linearToDbfs(reading.outputPeakLinear) as Any,
      "overloadCount": reading.overloadCount,
    ]

    if let scope {
      meters["scope"] = [
        "samples": scope.samples.withUnsafeBytes { Data($0).base64EncodedString() },
        "sampleRateHz": scope.sampleRateHz,
      ]
    }

    return meters
  }
}

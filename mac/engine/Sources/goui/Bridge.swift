import GouiEngine
import WebKit

struct BridgeError: Error, CustomStringConvertible {
  let description: String
}

// A message from the page. type names it, and the other fields belong to that type.
private struct Request: Decodable {
  let type: String
  let isOn: Bool?
  let sound: PlayedSound?
  let text: String?
  let band: Band?
  let sampleRateHz: Double?
  let frequenciesHz: [Double]?
  let url: String?
  let height: Double?
}

// Answers the page's messages and sends it events. Only pages served by goui reach it.
@MainActor
final class Bridge: NSObject, WKScriptMessageHandlerWithReply {
  static let name = "goui"
  static let maxPreampDb = 24.0
  static let maxFrequencyCount = 1000

  weak var webView: WKWebView?
  var onResize: ((Double) -> Void)?
  private let engine: Engine
  private let storage = WebStorage()
  private var config: SavedConfig

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
    webView?.callAsyncJavaScript("window.dispatchEvent(new CustomEvent(\"goui\", { detail }))", arguments: ["detail": ["type": "status", "status": describeStatus()]], in: nil, in: .page)
  }

  private func answer(_ body: Any) throws -> Any? {
    if let storageAnswer = try answerStorage(body) { return storageAnswer }

    let request = try JSONDecoder().decode(Request.self, from: JSONSerialization.data(withJSONObject: body))
    switch request.type {
    case "status":
      return describeStatus()
    case "meters":
      return engine.readMeters().map { describeMeters($0, scope: engine.readScope()) }
    case "sound":
      guard let sound = request.sound, sound.preampDb.isFinite else { throw BridgeError(description: "A sound message needs a sound with a finite preampDb") }

      var newConfig = config
      newConfig.sound = sound
      newConfig.sound.preampDb = min(max(sound.preampDb, -Self.maxPreampDb), Self.maxPreampDb)
      try engine.setSound(newConfig.playedSound)
      config = newConfig
      config.write()
      return nil
    case "power":
      guard let isOn = request.isOn else { throw BridgeError(description: "A power message needs isOn") }

      config.isOn = isOn
      config.write()
      if isOn { engine.start() } else { engine.stop() }
      return nil
    case "response":
      guard let band = request.band, let sampleRateHz = request.sampleRateHz, let frequenciesHz = request.frequenciesHz, frequenciesHz.count <= Self.maxFrequencyCount else {
        throw BridgeError(description: "A response message needs a band, a sampleRateHz and up to \(Self.maxFrequencyCount) frequenciesHz")
      }

      return try bandResponse(band, sampleRateHz: sampleRateHz, frequenciesHz: frequenciesHz)
    case "open":
      guard let text = request.url, let url = URL(string: text), url.scheme == "https" || url.scheme == "http" else {
        throw BridgeError(description: "An open message needs a web address")
      }

      NSWorkspace.shared.open(url)
      return nil
    case "size":
      guard let height = request.height, height.isFinite, height > 0 else { throw BridgeError(description: "A size message needs a height above 0") }

      onResize?(height)
      return nil
    case "restart":
      engine.restart(reason: "The page asked for a restart.")
      return nil
    case "print":
      print("Page: \(request.text ?? "")")
      return nil
    default:
      throw BridgeError(description: "goui has no message called \(request.type)")
    }
  }

  // Storage items can hold any JSON, so these messages are read by hand. Returns nil for any other message.
  private func answerStorage(_ body: Any) throws -> Any? {
    guard let message = body as? [String: Any], let type = message["type"] as? String, type.hasPrefix("storage:") else { return nil }

    let keys = message["keys"] as? [String]
    switch type {
    case "storage:get":
      return storage.read(keys)
    case "storage:set":
      guard let items = message["items"] as? [String: Any] else { throw BridgeError(description: "A storage:set message needs items") }

      try storage.write(items)
    case "storage:remove":
      storage.remove(keys ?? [])
    default:
      throw BridgeError(description: "goui has no message called \(type)")
    }
    return NSNull()
  }

  private func describeStatus() -> [String: String] {
    switch engine.status {
    case .stopped: ["state": "stopped"]
    case .starting: ["state": "starting"]
    case .running: ["state": "running"]
    case .waitingToRetry(let lastError): ["state": "waitingToRetry", "lastError": lastError]
    }
  }

  // The scope goes as base64 of its Float32 bytes, far smaller and quicker than 8192 numbers.
  private func describeMeters(_ reading: MeterReading, scope: ScopeReading?) -> [String: Any] {
    var meters: [String: Any] = [
      "callbacksPerSecond": reading.callbacksPerSecond,
      "inputPeakDb": toDbfs(reading.inputPeakLinear) as Any,
      "outputPeakDb": toDbfs(reading.outputPeakLinear) as Any,
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

// nil for silence, which has no level in dB.
private func toDbfs(_ linear: Float) -> Double? {
  linear > 0 ? (20 * log10(Double(linear)) * 10).rounded() / 10 : nil
}

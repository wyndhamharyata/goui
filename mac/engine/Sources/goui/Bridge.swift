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
}

// Answers the page's messages and sends it events. Only pages served by goui reach it.
@MainActor
final class Bridge: NSObject, WKScriptMessageHandlerWithReply {
  static let name = "goui"
  static let maxPreampDb = 24.0
  static let maxFrequencyCount = 1000

  weak var webView: WKWebView?
  private let engine: Engine
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
    let request = try JSONDecoder().decode(Request.self, from: JSONSerialization.data(withJSONObject: body))
    switch request.type {
    case "status":
      return describeStatus()
    case "meters":
      return engine.readMeters().map(describeMeters)
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

  private func describeStatus() -> [String: String] {
    switch engine.status {
    case .stopped: ["state": "stopped"]
    case .running: ["state": "running"]
    case .waitingToRetry(let lastError): ["state": "waitingToRetry", "lastError": lastError]
    }
  }

  private func describeMeters(_ reading: MeterReading) -> [String: Any] {
    [
      "callbacksPerSecond": reading.callbacksPerSecond,
      "inputPeakDb": toDbfs(reading.inputPeakLinear) as Any,
      "outputPeakDb": toDbfs(reading.outputPeakLinear) as Any,
      "overloadCount": reading.overloadCount,
    ]
  }
}

// nil for silence, which has no level in dB.
private func toDbfs(_ linear: Float) -> Double? {
  linear > 0 ? (20 * log10(Double(linear)) * 10).rounded() / 10 : nil
}

import Render

public struct Band: Codable, Equatable, Sendable {
  public var on: Bool
  public var type: String
  public var frequencyHz: Double
  public var gainDb: Double
  public var q: Double

  public init(on: Bool, type: String, frequencyHz: Double, gainDb: Double, q: Double) {
    self.on = on
    self.type = type
    self.frequencyHz = frequencyHz
    self.gainDb = gainDb
    self.q = q
  }
}

// The preamp and the bands the engine plays, as toPlayedSound in src/shared/config.js makes them.
public struct Sound: Equatable, Sendable {
  public static let flat = Sound(preampDb: 0, bands: [])

  public var preampDb: Double
  public var bands: [Band]

  public init(preampDb: Double, bands: [Band]) {
    self.preampDb = preampDb
    self.bands = bands
  }
}

// The sound as the C render code takes it, with the bands that are off left out.
struct RenderSound {
  let preampDb: Double
  let bands: [RenderBand]
}

// goui's band types, from src/shared/bands.js, and the Web Audio filter each one plays as.
private let bandKinds: [String: BandKind] = [
  "PK": .peak, "LSC": .lowShelf, "LSF": .lowShelf, "HSC": .highShelf, "HSF": .highShelf,
  "LP": .lowPass, "HP": .highPass, "BP": .bandPass, "NO": .notch, "AP": .allPass,
]

extension Band {
  func toRenderBand() throws -> RenderBand {
    guard let kind = bandKinds[type] else { throw GouiError("goui has no band type called \(type)") }
    guard frequencyHz.isFinite, frequencyHz > 0, gainDb.isFinite, q.isFinite, q > 0 else {
      throw GouiError("A \(type) band needs a frequency and Q above 0 and a finite gain")
    }

    return RenderBand(kind: kind, frequencyHz: frequencyHz, gainDb: gainDb, q: q)
  }
}

extension Sound {
  func toRenderSound() throws -> RenderSound {
    guard preampDb.isFinite else { throw GouiError("The preamp must be a finite number") }

    let bands = try bands.filter(\.on).map { try $0.toRenderBand() }
    guard bands.count <= Int(maxBandCount) else { throw GouiError("goui plays up to \(maxBandCount) bands at once") }

    return RenderSound(preampDb: preampDb, bands: bands)
  }
}

// The band's gain at each frequency, from the coefficients the engine plays. The check page compares it with WebKit.
public func bandResponse(_ band: Band, sampleRateHz: Double, frequenciesHz: [Double]) throws -> [Double] {
  guard sampleRateHz > 0 else { throw GouiError("The sample rate must be above 0") }

  let renderBand = try band.toRenderBand()
  var magnitudes = [Double](repeating: 0, count: frequenciesHz.count)
  renderBandResponse(renderBand, sampleRateHz, frequenciesHz, &magnitudes, UInt32(frequenciesHz.count))
  return magnitudes
}

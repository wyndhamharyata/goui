import CoreAudio
import Foundation
import Render

struct AudioPathSummary {
  let outputName: String
  let sampleRateHz: Double
  let tapChannelCount: UInt32
  let totalDelayMs: Double
  let bufferDelayMs: Double
}

public struct MeterReading {
  public let callbacksPerSecond: Double
  public let inputPeakLinear: Float
  public let outputPeakLinear: Float
  public let inputBufferCount: UInt32
  public let tapChannelCount: UInt32
  public let clippedSampleCount: UInt64
  public let overloadCount: Int
}

public struct ScopeReading {
  // The last frames played, mixed to mono, oldest first.
  public let samples: [Float]
  public let sampleRateHz: Double
}

// One run of the audio path: a muted tap of every other process, played to the default output.
@MainActor
final class AudioPath {
  let summary: AudioPathSummary
  private var render: OpaquePointer?
  private var teardown: Teardown
  private var overloadListener: PropertyListener?
  private var sampleRateListener: PropertyListener?
  private var overloadCount = 0
  private var lastCallbackCount: UInt64 = 0
  private var lastMeterNanoseconds: UInt64

  init(built: BuiltAudioPath, onSampleRateChange: @escaping @MainActor () -> Void) throws {
    summary = built.summary
    render = built.render
    teardown = built.teardown
    lastMeterNanoseconds = DispatchTime.now().uptimeNanoseconds

    do {
      overloadListener = try PropertyListener(object: built.aggregateID, selector: kAudioDeviceProcessorOverload) { [weak self] in
        self?.overloadCount += 1
      }
      // A call on a Bluetooth headphone changes its rate, and the filters were worked out for the old one.
      sampleRateListener = try PropertyListener(object: built.outputID, selector: kAudioDevicePropertyNominalSampleRate, handler: onSampleRateChange)
    } catch {
      stop()
      throw error
    }
  }

  func stop() {
    overloadListener?.cancel()
    sampleRateListener?.cancel()
    teardown.runAll()
    render = nil
  }

  // False while the last change still fades. A stopped path takes nothing and returns true.
  func trySetSound(_ sound: RenderSound) -> Bool {
    guard let render else { return true }

    return sound.bands.withUnsafeBufferPointer { bands in
      renderTrySetSound(render, sound.preampDb, bands.baseAddress, UInt32(bands.count))
    }
  }

  // Returns nil once the path has stopped.
  func readCallbackCount() -> UInt64? {
    guard let render else { return nil }
    return renderReadCallbackCount(render)
  }

  // Returns nil once the path has stopped.
  func readMeters() -> MeterReading? {
    guard let render else { return nil }
    var meters = RenderMeters()
    renderReadMeters(render, &meters)
    let nowNanoseconds = DispatchTime.now().uptimeNanoseconds
    let elapsedSeconds = Double(nowNanoseconds - lastMeterNanoseconds) / 1e9
    let callbacksPerSecond = elapsedSeconds > 0 ? Double(meters.callbackCount - lastCallbackCount) / elapsedSeconds : 0
    lastMeterNanoseconds = nowNanoseconds
    lastCallbackCount = meters.callbackCount
    return MeterReading(
      callbacksPerSecond: callbacksPerSecond, inputPeakLinear: meters.inputPeakLinear, outputPeakLinear: meters.outputPeakLinear,
      inputBufferCount: meters.inputBufferCount, tapChannelCount: meters.tapChannelCount,
      clippedSampleCount: meters.clippedSampleCount, overloadCount: overloadCount
    )
  }

  // Returns nil once the path has stopped.
  func readScope() -> ScopeReading? {
    guard let render else { return nil }
    var samples = [Float](repeating: 0, count: Int(scopeFrameCount))
    samples.withUnsafeMutableBufferPointer { renderReadScope(render, $0.baseAddress!) }
    return ScopeReading(samples: samples, sampleRateHz: summary.sampleRateHz)
  }
}

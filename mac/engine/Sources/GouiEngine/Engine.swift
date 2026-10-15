import CoreAudio
import Foundation
import Render

// DispatchTime counts in nanoseconds.
private let nanosecondsPerSecond = 1_000_000_000.0

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

// Keeps one audio path playing: a muted tap of every other process, played to the default output. It builds the path again when the output changes, a start fails or the callbacks stop.
@MainActor
public final class Engine {
  public enum Status: Equatable {
    case stopped
    // The path builds away from the main thread. The first build waits for the permission prompt.
    case starting
    case running
    case waitingToRetry(lastError: String)
  }

  private static let retryDelaysSeconds = [0.3, 1, 3]
  // A change that arrives during a fade waits this long, then the newest sound goes in.
  private static let fadeWaitSeconds = 0.005
  // A new device and then its new rate can arrive together, so a restart waits for them to settle.
  private static let restartSettleSeconds = 0.3
  // The callbacks run about 90 times a second, even in silence. None for this long means the path hangs.
  private static let callbackWatchSeconds = 2.0
  private static let buildQueue = DispatchQueue(label: "goui.engine.build", qos: .userInitiated)

  private var sound = RenderSound(preampDb: 0, bands: [])
  public var onStatusChange: ((Status) -> Void)?
  public private(set) var status = Status.stopped {
    didSet {
      if status != oldValue { onStatusChange?(status) }
    }
  }
  private var built: BuiltAudioPath?
  // The engine lives as long as the app, so this listener is never taken off.
  private var defaultOutputListener = Teardown()
  // A build that finishes after a newer start or a stop finds its task cancelled and is taken down.
  private var buildTask: Task<Void, Never>?
  private var pendingStart: Task<Void, Never>?
  private var pendingSound: Task<Void, Never>?
  private var pendingWatch: Task<Void, Never>?
  private var failedStartCount = 0
  private var watchedCallbackCount: UInt64 = 0
  private var overloadCount = 0
  private var lastCallbackCount: UInt64 = 0
  private var lastMeterNanoseconds: UInt64 = 0

  public init() throws {
    try listen(to: AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDefaultOutputDevice, teardown: &defaultOutputListener) { [weak self] in
      self?.restart(reason: "The default output changed.")
    }
  }

  public func start() {
    pendingStart?.cancel()
    guard built == nil else { return }

    buildTask?.cancel()
    status = .starting
    let sound = sound
    buildTask = Task { [weak self] in
      // The build waits for the permission prompt, so it runs off the main thread.
      let buildResult = await withCheckedContinuation { continuation in
        Engine.buildQueue.async {
          continuation.resume(returning: Result { try BuiltAudioPath.build(sound: sound) })
        }
      }
      guard let self, !Task.isCancelled else {
        // A cancelled build still finishes its work, so its path comes down here.
        if case .success(var built) = buildResult { built.teardown.runAll() }
        return
      }

      finishStart(buildResult)
    }
  }

  public func stop() {
    pendingStart?.cancel()
    buildTask?.cancel()
    stopPath()
    status = .stopped
  }

  public func restart(reason: String) {
    guard status != .stopped else { return }
    scheduleStart(afterSeconds: Self.restartSettleSeconds) { [weak self] in
      self?.stopPath()
      print("\(reason) Starting again.")
      self?.start()
    }
  }

  // Throws when the sound cannot play, and keeps the one before.
  public func setSound(_ sound: Sound) throws {
    self.sound = try sound.toRenderSound()
    sendSoundToPath()
  }

  public func readMeters() -> MeterReading? {
    guard let render = built?.render else { return nil }

    var meters = RenderMeters()
    renderReadMeters(render, &meters)

    let nowNanoseconds = DispatchTime.now().uptimeNanoseconds
    let elapsedSeconds = Double(nowNanoseconds - lastMeterNanoseconds) / nanosecondsPerSecond
    let callbacksPerSecond = elapsedSeconds > 0 ? Double(meters.callbackCount - lastCallbackCount) / elapsedSeconds : 0
    lastMeterNanoseconds = nowNanoseconds
    lastCallbackCount = meters.callbackCount

    return MeterReading(
      callbacksPerSecond: callbacksPerSecond, inputPeakLinear: meters.inputPeakLinear, outputPeakLinear: meters.outputPeakLinear,
      inputBufferCount: meters.inputBufferCount, tapChannelCount: meters.tapChannelCount,
      clippedSampleCount: meters.clippedSampleCount, overloadCount: overloadCount
    )
  }

  public func readScope() -> ScopeReading? {
    guard let built else { return nil }

    var samples = [Float](repeating: 0, count: Int(scopeFrameCount))
    samples.withUnsafeMutableBufferPointer { renderReadScope(built.render, $0.baseAddress!) }
    return ScopeReading(samples: samples, sampleRateHz: built.summary.sampleRateHz)
  }

  private func finishStart(_ buildResult: Result<BuiltAudioPath, any Error>) {
    do {
      var built = try buildResult.get()
      try listenToBuiltPath(&built)

      self.built = built
      overloadCount = 0
      lastCallbackCount = 0
      lastMeterNanoseconds = DispatchTime.now().uptimeNanoseconds
      status = .running
      failedStartCount = 0
      printSummary(built.summary)
      // The sound can change while the path builds.
      sendSoundToPath()
      watchedCallbackCount = 0
      watchCallbacks()
    } catch {
      let delaySeconds = Self.retryDelaysSeconds[min(failedStartCount, Self.retryDelaysSeconds.count - 1)]
      failedStartCount += 1
      status = .waitingToRetry(lastError: "\(error)")
      print("goui engine could not start. \(error). Trying again in \(delaySeconds) s.")
      scheduleStart(afterSeconds: delaySeconds) { [weak self] in self?.start() }
    }
  }

  // A failed listener takes the whole built path down with it, so the next start builds a clean one.
  private func listenToBuiltPath(_ built: inout BuiltAudioPath) throws {
    do {
      try listen(to: built.aggregateID, kAudioDeviceProcessorOverload, teardown: &built.teardown) { [weak self] in
        self?.overloadCount += 1
      }
      // A call on a Bluetooth headphone changes its rate, and the filters were worked out for the old one.
      try listen(to: built.outputID, kAudioDevicePropertyNominalSampleRate, teardown: &built.teardown) { [weak self] in
        self?.restart(reason: "The sample rate of the output changed.")
      }
    } catch {
      built.teardown.runAll()
      throw error
    }
  }

  // The render code refuses a new sound while the last change still fades.
  private func sendSoundToPath() {
    pendingSound?.cancel()
    guard let render = built?.render else { return }

    let isTaken = sound.bands.withUnsafeBufferPointer { bands in
      renderTrySetSound(render, sound.preampDb, bands.baseAddress, UInt32(bands.count))
    }
    if !isTaken {
      pendingSound = schedule(afterSeconds: Self.fadeWaitSeconds) { [weak self] in self?.sendSoundToPath() }
    }
  }

  private func watchCallbacks() {
    pendingWatch = schedule(afterSeconds: Self.callbackWatchSeconds) { [weak self] in self?.checkCallbacks() }
  }

  private func checkCallbacks() {
    guard let render = built?.render else { return }

    let count = renderReadCallbackCount(render)
    guard count != watchedCallbackCount else {
      restart(reason: "The audio callbacks stopped.")
      return
    }

    watchedCallbackCount = count
    watchCallbacks()
  }

  private func stopPath() {
    pendingWatch?.cancel()
    built?.teardown.runAll()
    built = nil
  }

  private func scheduleStart(afterSeconds delaySeconds: Double, _ action: @escaping @MainActor () -> Void) {
    pendingStart?.cancel()
    pendingStart = schedule(afterSeconds: delaySeconds, action)
  }

  // Main-actor work that runs once, later, unless its task is cancelled first.
  private func schedule(afterSeconds delaySeconds: Double, _ action: @escaping @MainActor () -> Void) -> Task<Void, Never> {
    Task {
      try? await Task.sleep(for: .seconds(delaySeconds))
      if !Task.isCancelled { action() }
    }
  }
}

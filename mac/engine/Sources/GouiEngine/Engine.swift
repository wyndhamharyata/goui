import CoreAudio
import Foundation

// Keeps one audio path playing, building it again when the output changes or a start fails.
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

  private var sound = RenderSound(preampDb: 0, bands: [])
  public var onStatusChange: ((Status) -> Void)?
  public private(set) var status = Status.stopped {
    didSet { if status != oldValue { onStatusChange?(status) } }
  }
  private var path: AudioPath?
  private var defaultOutputListener: PropertyListener?
  private var pendingStart: DispatchWorkItem?
  private var failedStartCount = 0
  private var pendingSound: DispatchWorkItem?
  // Each start has a number. A build that finishes after a newer start or a stop is taken down.
  private var startNumber = 0
  private let buildQueue = DispatchQueue(label: "goui.engine.build", qos: .userInitiated)

  public init() throws {
    defaultOutputListener = try PropertyListener(object: AudioObjectID(kAudioObjectSystemObject), selector: kAudioHardwarePropertyDefaultOutputDevice) { [weak self] in
      self?.restart(reason: "The default output changed.")
    }
  }

  public func start() {
    cancelPendingStart()
    guard path == nil else { return }

    startNumber += 1
    if status != .starting { status = .starting }
    let number = startNumber
    let sound = sound
    buildQueue.async {
      let result = Result { try BuiltAudioPath.build(sound: sound) }
      DispatchQueue.main.async { MainActor.assumeIsolated { [weak self] in self?.finishStart(result, number: number) } }
    }
  }

  public func stop() {
    cancelPendingStart()
    startNumber += 1
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
    path?.readMeters()
  }

  private func finishStart(_ result: Result<BuiltAudioPath, any Error>, number: Int) {
    guard number == startNumber else {
      if case .success(var built) = result { built.teardown.runAll() }
      return
    }

    do {
      let path = try AudioPath(built: result.get()) { [weak self] in
        self?.restart(reason: "The sample rate of the output changed.")
      }
      self.path = path
      status = .running
      failedStartCount = 0
      printSummary(path.summary)
      // The sound can change while the path builds.
      sendSoundToPath()
    } catch {
      let delaySeconds = Self.retryDelaysSeconds[min(failedStartCount, Self.retryDelaysSeconds.count - 1)]
      failedStartCount += 1
      status = .waitingToRetry(lastError: "\(error)")
      print("goui engine could not start. \(error). Trying again in \(delaySeconds) s.")
      scheduleStart(afterSeconds: delaySeconds) { [weak self] in self?.start() }
    }
  }

  private func sendSoundToPath() {
    pendingSound?.cancel()
    pendingSound = nil
    guard let path, !path.trySetSound(sound) else { return }

    let workItem = DispatchWorkItem { [weak self] in MainActor.assumeIsolated { self?.sendSoundToPath() } }
    pendingSound = workItem
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.fadeWaitSeconds, execute: workItem)
  }

  private func stopPath() {
    path?.stop()
    path = nil
  }

  private func scheduleStart(afterSeconds delaySeconds: Double, _ action: @escaping @MainActor () -> Void) {
    cancelPendingStart()
    let workItem = DispatchWorkItem { MainActor.assumeIsolated { action() } }
    pendingStart = workItem
    DispatchQueue.main.asyncAfter(deadline: .now() + delaySeconds, execute: workItem)
  }

  private func cancelPendingStart() {
    pendingStart?.cancel()
    pendingStart = nil
  }
}

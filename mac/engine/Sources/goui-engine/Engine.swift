import CoreAudio
import Foundation

// Keeps one audio path playing, building it again when the output changes or a start fails.
@MainActor
final class Engine {
  enum Status: Equatable {
    case stopped
    case running
    case waitingToRetry(lastError: String)
  }

  private static let retryDelaysSeconds = [0.3, 1, 3]
  // A new device and then its new rate can arrive together, so a restart waits for them to settle.
  private static let restartSettleSeconds = 0.3

  private let options: Options
  private(set) var status = Status.stopped
  private var path: AudioPath?
  private var defaultOutputListener: PropertyListener?
  private var pendingStart: DispatchWorkItem?
  private var failedStartCount = 0

  init(options: Options) throws {
    self.options = options
    defaultOutputListener = try PropertyListener(object: AudioObjectID(kAudioObjectSystemObject), selector: kAudioHardwarePropertyDefaultOutputDevice) { [weak self] in
      self?.restart(reason: "The default output changed.")
    }
  }

  func start() {
    cancelPendingStart()
    guard path == nil else { return }
    do {
      let path = try AudioPath(options: options) { [weak self] in
        self?.restart(reason: "The sample rate of the output changed.")
      }
      self.path = path
      status = .running
      failedStartCount = 0
      printSummary(path.summary)
    } catch {
      let delaySeconds = Self.retryDelaysSeconds[min(failedStartCount, Self.retryDelaysSeconds.count - 1)]
      failedStartCount += 1
      status = .waitingToRetry(lastError: "\(error)")
      print("goui engine could not start. \(error). Trying again in \(delaySeconds) s.")
      scheduleStart(afterSeconds: delaySeconds) { [weak self] in self?.start() }
    }
  }

  func stop() {
    cancelPendingStart()
    stopPath()
    status = .stopped
  }

  func restart(reason: String) {
    guard status != .stopped else { return }
    scheduleStart(afterSeconds: Self.restartSettleSeconds) { [weak self] in
      self?.stopPath()
      print("\(reason) Starting again.")
      self?.start()
    }
  }

  func readMeters() -> MeterReading? {
    path?.readMeters()
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

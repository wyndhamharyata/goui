import CoreAudio
import Foundation
import Render

struct Options {
  var gainDb = 0.0
  var bassDb = 0.0
  var seconds: Double?

  static func read(_ arguments: [String]) -> Options {
    var options = Options()
    var index = 1
    while index + 1 < arguments.count {
      let value = Double(arguments[index + 1])
      switch arguments[index] {
      case "--gain-db": options.gainDb = value ?? 0
      case "--bass-db": options.bassDb = value ?? 0
      case "--seconds": options.seconds = value
      default: break
      }
      index += 2
    }
    return options
  }
}

struct AudioError: Error, CustomStringConvertible {
  let step: String
  let status: OSStatus

  var description: String {
    let bytes = withUnsafeBytes(of: status.bigEndian) { Array($0) }
    let isFourCharacters = bytes.allSatisfy { (32...126).contains($0) }
    let code = isFourCharacters ? "'\(String(decoding: bytes, as: UTF8.self))'" : "\(status)"
    return "\(step) failed with \(code)"
  }
}

func check(_ status: OSStatus, _ step: String) throws {
  if status != noErr { throw AudioError(step: step, status: status) }
}

func address(_ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
}

func readValue<Value: BitwiseCopyable>(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal, initial: Value) throws -> Value {
  var where_ = address(selector, scope)
  var value = initial
  var size = UInt32(MemoryLayout<Value>.size)
  try check(AudioObjectGetPropertyData(object, &where_, 0, nil, &size, &value), "Reading \(selector)")
  return value
}

func readString(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector) throws -> String {
  var where_ = address(selector)
  var value: Unmanaged<CFString>?
  var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
  try check(AudioObjectGetPropertyData(object, &where_, 0, nil, &size, &value), "Reading \(selector)")
  return value?.takeRetainedValue() as String? ?? ""
}

func findOwnProcess() throws -> AudioObjectID {
  var where_ = address(kAudioHardwarePropertyTranslatePIDToProcessObject)
  var processID = getpid()
  var process = AudioObjectID(kAudioObjectUnknown)
  var size = UInt32(MemoryLayout<AudioObjectID>.size)
  let status = AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &where_, UInt32(MemoryLayout<pid_t>.size), &processID, &size, &process)
  try check(status, "Finding this process")
  return process
}

func toDbfs(_ linear: Float) -> String {
  linear > 0 ? String(format: "%6.1f dBFS", 20 * log10(linear)) : "  silent   "
}

// One run of the audio path: a tap of every other process, muted, and a private aggregate device
// that plays it to the default output.
@MainActor
final class Session {
  let outputName: String
  let outputID: AudioObjectID
  let tapID: AudioObjectID
  let aggregateID: AudioObjectID
  let ioProcID: AudioDeviceIOProcID
  let render: OpaquePointer
  var overloadCount = 0
  private var overloadListener: AudioObjectPropertyListenerBlock?
  private var sampleRateListener: AudioObjectPropertyListenerBlock?

  init(options: Options, onSampleRateChange: @escaping @MainActor () -> Void) throws {
    let outputID: AudioObjectID = try readValue(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDefaultOutputDevice, initial: 0)
    self.outputID = outputID
    let outputUID = try readString(outputID, kAudioDevicePropertyDeviceUID)
    outputName = try readString(outputID, kAudioObjectPropertyName)

    // The tap skips this process. Its own output would come back into the tap.
    let ownProcess = try findOwnProcess()
    let tapDescription = CATapDescription(stereoGlobalTapButExcludeProcesses: ownProcess == kAudioObjectUnknown ? [] : [ownProcess])
    tapDescription.uuid = UUID()
    tapDescription.name = "goui"
    tapDescription.isPrivate = true
    tapDescription.muteBehavior = .muted
    var tapID = AudioObjectID(kAudioObjectUnknown)
    try check(AudioHardwareCreateProcessTap(tapDescription, &tapID), "Creating the tap")
    self.tapID = tapID

    let aggregateDescription: [String: Any] = [
      kAudioAggregateDeviceNameKey: "goui",
      kAudioAggregateDeviceUIDKey: UUID().uuidString,
      kAudioAggregateDeviceMainSubDeviceKey: outputUID,
      kAudioAggregateDeviceIsPrivateKey: true,
      kAudioAggregateDeviceIsStackedKey: false,
      kAudioAggregateDeviceTapAutoStartKey: false,
      kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: outputUID]],
      kAudioAggregateDeviceTapListKey: [[kAudioSubTapUIDKey: tapDescription.uuid.uuidString, kAudioSubTapDriftCompensationKey: true]],
    ]
    var aggregateID = AudioObjectID(kAudioObjectUnknown)
    try check(AudioHardwareCreateAggregateDevice(aggregateDescription as CFDictionary, &aggregateID), "Creating the aggregate device")
    self.aggregateID = aggregateID

    let sampleRateHz: Float64 = try readValue(aggregateID, kAudioDevicePropertyNominalSampleRate, initial: 0)
    let tapFormat: AudioStreamBasicDescription = try readValue(tapID, kAudioTapPropertyFormat, initial: AudioStreamBasicDescription())
    render = renderStateCreate(options.gainDb, options.bassDb, sampleRateHz)

    var ioProcID: AudioDeviceIOProcID?
    try check(AudioDeviceCreateIOProcID(aggregateID, renderAudio, UnsafeMutableRawPointer(render), &ioProcID), "Creating the audio callback")
    self.ioProcID = ioProcID!
    try check(AudioDeviceStart(aggregateID, ioProcID), "Starting the aggregate device")

    listenForOverloads()
    listenForSampleRate(onSampleRateChange)
    try printSummary(sampleRateHz: sampleRateHz, tapFormat: tapFormat, ownProcess: ownProcess)
  }

  private func listenForOverloads() {
    var where_ = address(kAudioDeviceProcessorOverload)
    let listener: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
      MainActor.assumeIsolated { self?.overloadCount += 1 }
    }
    AudioObjectAddPropertyListenerBlock(aggregateID, &where_, DispatchQueue.main, listener)
    overloadListener = listener
  }

  // The same device can change its rate, as a Bluetooth headphone does when a call opens its
  // microphone. The bands were worked out for the old rate.
  private func listenForSampleRate(_ onSampleRateChange: @escaping @MainActor () -> Void) {
    var where_ = address(kAudioDevicePropertyNominalSampleRate)
    let listener: AudioObjectPropertyListenerBlock = { _, _ in
      MainActor.assumeIsolated { onSampleRateChange() }
    }
    AudioObjectAddPropertyListenerBlock(outputID, &where_, DispatchQueue.main, listener)
    sampleRateListener = listener
  }

  // The device latency is there with or without goui. The engine's own share is its buffer.
  private func printSummary(sampleRateHz: Float64, tapFormat: AudioStreamBasicDescription, ownProcess: AudioObjectID) throws {
    let output = kAudioObjectPropertyScopeOutput
    let latencyFrames: UInt32 = try readValue(aggregateID, kAudioDevicePropertyLatency, output, initial: 0)
    let safetyFrames: UInt32 = try readValue(aggregateID, kAudioDevicePropertySafetyOffset, output, initial: 0)
    let bufferFrames: UInt32 = try readValue(aggregateID, kAudioDevicePropertyBufferFrameSize, initial: 0)
    let totalFrames = Double(latencyFrames + safetyFrames + bufferFrames)
    print("Output       \(outputName) at \(Int(sampleRateHz)) Hz")
    print("Tap          \(tapFormat.mChannelsPerFrame) channels at \(Int(tapFormat.mSampleRate)) Hz, this process is object \(ownProcess)")
    print(String(format: "Delay        %.1f ms from the tap to the ear, of which the engine's buffer is %.1f ms",
                 totalFrames / sampleRateHz * 1000, Double(bufferFrames) / sampleRateHz * 1000))
  }

  func printMeters(everySeconds: Double, previousCallbackCount: inout UInt64) {
    var meters = RenderMeters()
    renderReadMeters(render, &meters)
    let callbacksPerSecond = Double(meters.callbackCount - previousCallbackCount) / everySeconds
    previousCallbackCount = meters.callbackCount
    print(String(format: "%5.0f callbacks/s  in %@  out %@  inputs %u  tap channels %u  overloads %d",
                 callbacksPerSecond, toDbfs(meters.inputPeakLinear), toDbfs(meters.outputPeakLinear),
                 meters.inputBufferCount, meters.tapChannelCount, overloadCount))
  }

  func stop() {
    var where_ = address(kAudioDevicePropertyNominalSampleRate)
    if let sampleRateListener {
      AudioObjectRemovePropertyListenerBlock(outputID, &where_, DispatchQueue.main, sampleRateListener)
    }
    AudioDeviceStop(aggregateID, ioProcID)
    AudioDeviceDestroyIOProcID(aggregateID, ioProcID)
    AudioHardwareDestroyAggregateDevice(aggregateID)
    AudioHardwareDestroyProcessTap(tapID)
    renderStateDestroy(render)
  }
}

// A pipe holds printed lines until it fills, and kill -9 loses them. Each line goes out at once.
setvbuf(stdout, nil, _IOLBF, 0)
let options = Options.read(CommandLine.arguments)
let meterEverySeconds = 2.0
var session: Session?
var previousCallbackCount: UInt64 = 0
var restartCount = 0

@MainActor
func startSession() {
  do {
    session = try Session(options: options) { restartSoon("The sample rate of the output changed.") }
    previousCallbackCount = 0
  } catch {
    print("goui engine could not start. \(error)")
    exit(1)
  }
}

@MainActor
func stopAndExit() {
  session?.stop()
  print("Stopped. The Mac plays sound the normal way again.")
  exit(0)
}

print("goui engine. Gain \(options.gainDb) dB, bass \(options.bassDb) dB at 105 Hz. Press Control-C to stop.")
print("If the Mac goes quiet, allow the terminal under System Settings, Privacy & Security, Screen & System Audio Recording.")
startSession()

// Several changes can arrive at once, such as a new device and then its new rate, so the restart
// waits for them to settle.
@MainActor
func restartSoon(_ reason: String) {
  restartCount += 1
  let restart = restartCount
  DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
    MainActor.assumeIsolated {
      guard restart == restartCount else { return }
      session?.stop()
      print("\(reason) Starting again.")
      startSession()
    }
  }
}

var outputChangeAddress = address(kAudioHardwarePropertyDefaultOutputDevice)
AudioObjectAddPropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject), &outputChangeAddress, DispatchQueue.main) { _, _ in
  MainActor.assumeIsolated { restartSoon("The default output changed.") }
}

let meterTimer = DispatchSource.makeTimerSource(queue: .main)
meterTimer.schedule(deadline: .now() + meterEverySeconds, repeating: meterEverySeconds)
meterTimer.setEventHandler {
  MainActor.assumeIsolated { session?.printMeters(everySeconds: meterEverySeconds, previousCallbackCount: &previousCallbackCount) }
}
meterTimer.resume()

var signalSources: [DispatchSourceSignal] = []
for signalNumber in [SIGINT, SIGTERM] {
  signal(signalNumber, SIG_IGN)
  let source = DispatchSource.makeSignalSource(signal: signalNumber, queue: .main)
  source.setEventHandler { MainActor.assumeIsolated { stopAndExit() } }
  source.resume()
  signalSources.append(source)
}

if let seconds = options.seconds {
  DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { MainActor.assumeIsolated { stopAndExit() } }
}

dispatchMain()

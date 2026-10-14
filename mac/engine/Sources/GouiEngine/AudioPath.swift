import CoreAudio
import Foundation
import Render

private let systemObject = AudioObjectID(kAudioObjectSystemObject)

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

// Undoes each built step in reverse order. A failed step is printed and the rest still run.
private struct Teardown {
  private var steps: [(name: String, run: () -> OSStatus)] = []

  mutating func add(_ name: String, _ run: @escaping () -> OSStatus) {
    steps.append((name, run))
  }

  mutating func runAll() {
    for step in steps.reversed() {
      let status = step.run()
      if status != noErr { print(AudioError(step: step.name, status: status)) }
    }
    steps = []
  }
}

// One run of the audio path: a muted tap of every other process, played to the default output.
@MainActor
final class AudioPath {
  let summary: AudioPathSummary
  private var render: OpaquePointer?
  private var teardown = Teardown()
  private var overloadListener: PropertyListener?
  private var sampleRateListener: PropertyListener?
  private var overloadCount = 0
  private var lastCallbackCount: UInt64 = 0
  private var lastMeterNanoseconds: UInt64

  init(options: Options, onSampleRateChange: @escaping @MainActor () -> Void) throws {
    var teardown = Teardown()
    let outputID: AudioObjectID
    let aggregateID: AudioObjectID
    do {
      outputID = try readProperty(of: systemObject, kAudioHardwarePropertyDefaultOutputDevice, as: AudioObjectID.self)
      let outputUID = try readString(of: outputID, kAudioDevicePropertyDeviceUID)
      let outputName = try readString(of: outputID, kAudioObjectPropertyName)

      let tapUUID = UUID()
      let tapID = try createTap(uuid: tapUUID)
      teardown.add("Destroying the tap") { AudioHardwareDestroyProcessTap(tapID) }
      let tapChannelCount = try readTapChannelCount(tapID)

      aggregateID = try createAggregateDevice(outputUID: outputUID, tapUUID: tapUUID)
      teardown.add("Destroying the aggregate device") { AudioHardwareDestroyAggregateDevice(aggregateID) }
      let sampleRateHz = try readProperty(of: aggregateID, kAudioDevicePropertyNominalSampleRate, as: Float64.self)
      guard sampleRateHz > 0 else { throw AudioError("The output reports a sample rate of \(sampleRateHz) Hz") }
      let tapBufferIndex = try findTapBufferIndex(outputID: outputID, aggregateID: aggregateID, tapChannelCount: tapChannelCount)

      guard let render = renderStateCreate(options.gainDb, options.bassDb, sampleRateHz, tapChannelCount, tapBufferIndex) else {
        throw AudioError("Creating the render state failed. Memory ran out or atomic float is not lock-free here")
      }
      teardown.add("Freeing the render state") { renderStateDestroy(render); return noErr }
      self.render = render

      var createdIOProcID: AudioDeviceIOProcID?
      try throwIfFailed(AudioDeviceCreateIOProcID(aggregateID, renderAudio, UnsafeMutableRawPointer(render), &createdIOProcID), step: "Creating the audio callback")
      guard let ioProcID = createdIOProcID else { throw AudioError("Creating the audio callback returned no callback") }
      teardown.add("Destroying the audio callback") { AudioDeviceDestroyIOProcID(aggregateID, ioProcID) }
      try throwIfFailed(AudioDeviceStart(aggregateID, ioProcID), step: "Starting the aggregate device")
      teardown.add("Stopping the aggregate device") { AudioDeviceStop(aggregateID, ioProcID) }

      summary = try readSummary(aggregateID: aggregateID, outputName: outputName, sampleRateHz: sampleRateHz, tapChannelCount: tapChannelCount)
    } catch {
      teardown.runAll()
      throw error
    }
    self.teardown = teardown
    lastMeterNanoseconds = DispatchTime.now().uptimeNanoseconds

    do {
      overloadListener = try PropertyListener(object: aggregateID, selector: kAudioDeviceProcessorOverload) { [weak self] in
        self?.overloadCount += 1
      }
      // A call on a Bluetooth headphone changes its rate, and the bass shelf was worked out for the old one.
      sampleRateListener = try PropertyListener(object: outputID, selector: kAudioDevicePropertyNominalSampleRate, handler: onSampleRateChange)
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

  func setGainDb(_ gainDb: Double) {
    guard let render else { return }
    renderSetGain(render, gainDb)
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
}

private func findOwnProcess() throws -> AudioObjectID {
  var address = propertyAddress(kAudioHardwarePropertyTranslatePIDToProcessObject)
  var processID = getpid()
  var process = AudioObjectID(kAudioObjectUnknown)
  var byteCount = UInt32(MemoryLayout<AudioObjectID>.size)
  let status = AudioObjectGetPropertyData(systemObject, &address, UInt32(MemoryLayout<pid_t>.size), &processID, &byteCount, &process)
  try throwIfFailed(status, step: "Finding this process")
  // Without its own process to leave out, the tap would hear the engine's output and feed it back.
  guard process != kAudioObjectUnknown else { throw AudioError("Core Audio does not know this process yet, so the tap would hear its own output") }
  return process
}

private func createTap(uuid: UUID) throws -> AudioObjectID {
  let tapDescription = CATapDescription(stereoGlobalTapButExcludeProcesses: [try findOwnProcess()])
  tapDescription.uuid = uuid
  tapDescription.name = "goui"
  tapDescription.isPrivate = true
  tapDescription.muteBehavior = .muted
  var tapID = AudioObjectID(kAudioObjectUnknown)
  try throwIfFailed(AudioHardwareCreateProcessTap(tapDescription, &tapID), step: "Creating the tap")
  return tapID
}

// The render code reads interleaved 32-bit float.
private func readTapChannelCount(_ tapID: AudioObjectID) throws -> UInt32 {
  let format = try readProperty(of: tapID, kAudioTapPropertyFormat, as: AudioStreamBasicDescription.self)
  let isFloat = format.mFormatFlags & kAudioFormatFlagIsFloat != 0
  let isInterleaved = format.mFormatFlags & kAudioFormatFlagIsNonInterleaved == 0
  let isReadable = format.mFormatID == kAudioFormatLinearPCM && isFloat && isInterleaved && format.mBitsPerChannel == 32
  guard isReadable else {
    throw AudioError("The tap plays \(fourCharacterCode(format.mFormatID)) with flags \(format.mFormatFlags), not interleaved 32-bit float")
  }
  guard (1...UInt32(maxTapChannelCount)).contains(format.mChannelsPerFrame) else {
    throw AudioError("The tap has \(format.mChannelsPerFrame) channels. The engine takes 1 to \(maxTapChannelCount)")
  }
  return format.mChannelsPerFrame
}

private func createAggregateDevice(outputUID: String, tapUUID: UUID) throws -> AudioObjectID {
  let aggregateDescription: [String: Any] = [
    kAudioAggregateDeviceNameKey: "goui",
    kAudioAggregateDeviceUIDKey: UUID().uuidString,
    kAudioAggregateDeviceMainSubDeviceKey: outputUID,
    kAudioAggregateDeviceIsPrivateKey: true,
    kAudioAggregateDeviceIsStackedKey: false,
    kAudioAggregateDeviceTapAutoStartKey: false,
    kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: outputUID]],
    kAudioAggregateDeviceTapListKey: [[kAudioSubTapUIDKey: tapUUID.uuidString, kAudioSubTapDriftCompensationKey: true]],
  ]
  var aggregateID = AudioObjectID(kAudioObjectUnknown)
  try throwIfFailed(AudioHardwareCreateAggregateDevice(aggregateDescription as CFDictionary, &aggregateID), step: "Creating the aggregate device")
  return aggregateID
}

// The aggregate device lists the output device's own inputs first, such as a headset mic, then the tap.
private func findTapBufferIndex(outputID: AudioObjectID, aggregateID: AudioObjectID, tapChannelCount: UInt32) throws -> UInt32 {
  let outputInputCount = try readInputChannelCounts(of: outputID).count
  let aggregateInputs = try readInputChannelCounts(of: aggregateID)
  let isTapAtIndex = outputInputCount < aggregateInputs.count && aggregateInputs[outputInputCount] == tapChannelCount
  guard isTapAtIndex else {
    throw AudioError("The tap is not the input buffer after the output's own inputs. The aggregate inputs have \(aggregateInputs) channels")
  }
  return UInt32(outputInputCount)
}

private func readInputChannelCounts(of device: AudioObjectID) throws -> [UInt32] {
  var address = propertyAddress(kAudioDevicePropertyStreamConfiguration, scope: kAudioObjectPropertyScopeInput)
  let step = "Reading \(fourCharacterCode(address.mSelector))"
  var byteCount: UInt32 = 0
  try throwIfFailed(AudioObjectGetPropertyDataSize(device, &address, 0, nil, &byteCount), step: step)
  let allocatedByteCount = max(Int(byteCount), MemoryLayout<AudioBufferList>.size)
  let list = UnsafeMutableRawPointer.allocate(byteCount: allocatedByteCount, alignment: MemoryLayout<AudioBufferList>.alignment)
  defer { list.deallocate() }
  list.initializeMemory(as: UInt8.self, repeating: 0, count: allocatedByteCount)
  try throwIfFailed(AudioObjectGetPropertyData(device, &address, 0, nil, &byteCount, list), step: step)
  let buffers = UnsafeMutableAudioBufferListPointer(list.assumingMemoryBound(to: AudioBufferList.self))
  return buffers.map { $0.mNumberChannels }
}

// The device latency is there with or without goui. The engine's own share is its buffer.
private func readSummary(aggregateID: AudioObjectID, outputName: String, sampleRateHz: Double, tapChannelCount: UInt32) throws -> AudioPathSummary {
  let output = kAudioObjectPropertyScopeOutput
  let latencyFrames = try readProperty(of: aggregateID, kAudioDevicePropertyLatency, scope: output, as: UInt32.self)
  let safetyFrames = try readProperty(of: aggregateID, kAudioDevicePropertySafetyOffset, scope: output, as: UInt32.self)
  let bufferFrames = try readProperty(of: aggregateID, kAudioDevicePropertyBufferFrameSize, as: UInt32.self)
  let totalFrames = Double(latencyFrames + safetyFrames + bufferFrames)
  return AudioPathSummary(
    outputName: outputName, sampleRateHz: sampleRateHz, tapChannelCount: tapChannelCount,
    totalDelayMs: totalFrames / sampleRateHz * 1000, bufferDelayMs: Double(bufferFrames) / sampleRateHz * 1000
  )
}

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

// Undoes each built step in reverse order. A failed step is printed and the rest still run.
struct Teardown: @unchecked Sendable {
  private var steps: [(name: String, run: () -> OSStatus)] = []

  mutating func add(_ name: String, _ run: @escaping () -> OSStatus) {
    steps.append((name, run))
  }

  mutating func runAll() {
    for step in steps.reversed() {
      let status = step.run()
      if status != noErr { print(GouiError(step: step.name, status: status)) }
    }
    steps = []
  }
}

// The tap, the aggregate device and the running callback, built away from the main thread. The first build waits there until the person answers the permission prompt.
struct BuiltAudioPath: @unchecked Sendable {
  let outputID: AudioObjectID
  let aggregateID: AudioObjectID
  let render: OpaquePointer
  let summary: AudioPathSummary
  var teardown: Teardown

  // Each step puts its own undo on the teardown, so a failed step takes down only what was built.
  static func build(sound: RenderSound) throws -> BuiltAudioPath {
    var teardown = Teardown()

    do {
      let output = try readDefaultOutput()
      let tap = try buildTap(teardown: &teardown)
      let aggregate = try buildAggregate(output: output, tap: tap, teardown: &teardown)
      let render = try startRender(sound: sound, aggregate: aggregate, tap: tap, teardown: &teardown)
      let summary = try readSummary(output: output, aggregate: aggregate, tap: tap)

      return BuiltAudioPath(outputID: output.id, aggregateID: aggregate.id, render: render, summary: summary, teardown: teardown)
    } catch {
      teardown.runAll()
      throw error
    }
  }
}

private struct OutputDevice {
  let id: AudioObjectID
  let uid: String
  let name: String
}

private struct BuiltTap {
  let uuid: UUID
  let channelCount: UInt32
}

private struct BuiltAggregate {
  let id: AudioObjectID
  let sampleRateHz: Double
  // The aggregate's input buffer that holds the tap.
  let tapBufferIndex: UInt32
}

private func readDefaultOutput() throws -> OutputDevice {
  let outputID = try readProperty(of: systemObject, kAudioHardwarePropertyDefaultOutputDevice, as: AudioObjectID.self)

  return OutputDevice(id: outputID, uid: try readString(of: outputID, kAudioDevicePropertyDeviceUID), name: try readString(of: outputID, kAudioObjectPropertyName))
}

private func buildTap(teardown: inout Teardown) throws -> BuiltTap {
  let tapUUID = UUID()
  let tapID = try createTap(uuid: tapUUID)

  teardown.add("Destroying the tap") { AudioHardwareDestroyProcessTap(tapID) }

  return BuiltTap(uuid: tapUUID, channelCount: try readTapChannelCount(tapID))
}

private func buildAggregate(output: OutputDevice, tap: BuiltTap, teardown: inout Teardown) throws -> BuiltAggregate {
  let aggregateID = try createAggregateDevice(outputUID: output.uid, tapUUID: tap.uuid)

  teardown.add("Destroying the aggregate device") { AudioHardwareDestroyAggregateDevice(aggregateID) }

  let sampleRateHz = try readProperty(of: aggregateID, kAudioDevicePropertyNominalSampleRate, as: Float64.self)
  guard sampleRateHz > 0 else { throw GouiError("The output reports a sample rate of \(sampleRateHz) Hz") }

  let tapBufferIndex = try findTapBufferIndex(outputID: output.id, aggregateID: aggregateID, tapChannelCount: tap.channelCount)

  return BuiltAggregate(id: aggregateID, sampleRateHz: sampleRateHz, tapBufferIndex: tapBufferIndex)
}

// The render state, and the callback that plays it on the aggregate device, started.
private func startRender(sound: RenderSound, aggregate: BuiltAggregate, tap: BuiltTap, teardown: inout Teardown) throws -> OpaquePointer {
  let createdRender = sound.bands.withUnsafeBufferPointer { bands in
    renderStateCreate(sound.preampDb, bands.baseAddress, UInt32(bands.count), aggregate.sampleRateHz, tap.channelCount, aggregate.tapBufferIndex)
  }
  guard let render = createdRender else {
    throw GouiError("Creating the render state failed. Memory ran out or atomic float is not lock-free here")
  }

  teardown.add("Freeing the render state") { renderStateDestroy(render); return noErr }

  let aggregateID = aggregate.id
  var createdIOProcID: AudioDeviceIOProcID?

  try throwIfFailed(AudioDeviceCreateIOProcID(aggregateID, renderAudio, UnsafeMutableRawPointer(render), &createdIOProcID), step: "Creating the audio callback")
  guard let ioProcID = createdIOProcID else { throw GouiError("Creating the audio callback returned no callback") }

  teardown.add("Destroying the audio callback") { AudioDeviceDestroyIOProcID(aggregateID, ioProcID) }
  try throwIfFailed(AudioDeviceStart(aggregateID, ioProcID), step: "Starting the aggregate device")
  teardown.add("Stopping the aggregate device") { AudioDeviceStop(aggregateID, ioProcID) }

  return render
}

// The device latency is there with or without goui. The engine's own share is its buffer.
private func readSummary(output: OutputDevice, aggregate: BuiltAggregate, tap: BuiltTap) throws -> AudioPathSummary {
  let millisecondsPerSecond = 1000.0
  let latencyFrames = try readProperty(of: aggregate.id, kAudioDevicePropertyLatency, scope: kAudioObjectPropertyScopeOutput, as: UInt32.self)
  let safetyFrames = try readProperty(of: aggregate.id, kAudioDevicePropertySafetyOffset, scope: kAudioObjectPropertyScopeOutput, as: UInt32.self)
  let bufferFrames = try readProperty(of: aggregate.id, kAudioDevicePropertyBufferFrameSize, as: UInt32.self)

  let totalDelayMs = Double(latencyFrames + safetyFrames + bufferFrames) / aggregate.sampleRateHz * millisecondsPerSecond
  let bufferDelayMs = Double(bufferFrames) / aggregate.sampleRateHz * millisecondsPerSecond

  return AudioPathSummary(outputName: output.name, sampleRateHz: aggregate.sampleRateHz, tapChannelCount: tap.channelCount, totalDelayMs: totalDelayMs, bufferDelayMs: bufferDelayMs)
}

private func findOwnProcess() throws -> AudioObjectID {
  var address = propertyAddress(kAudioHardwarePropertyTranslatePIDToProcessObject)
  // The process id goes in as the qualifier, and the audio object for it comes out.
  var processID = getpid()
  var process = AudioObjectID(kAudioObjectUnknown)
  var byteCount = UInt32(MemoryLayout<AudioObjectID>.size)
  let qualifierByteCount = UInt32(MemoryLayout<pid_t>.size)

  let status = AudioObjectGetPropertyData(systemObject, &address, qualifierByteCount, &processID, &byteCount, &process)
  try throwIfFailed(status, step: "Finding this process")
  // Without its own process to leave out, the tap would hear the engine's output and feed it back.
  guard process != kAudioObjectUnknown else { throw GouiError("Core Audio does not know this process yet, so the tap would hear its own output") }

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
    throw GouiError("The tap plays \(fourCharacterCode(format.mFormatID)) with flags \(format.mFormatFlags), not interleaved 32-bit float")
  }
  guard (1...UInt32(maxTapChannelCount)).contains(format.mChannelsPerFrame) else {
    throw GouiError("The tap has \(format.mChannelsPerFrame) channels. The engine takes 1 to \(maxTapChannelCount)")
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
  let outputInputChannelCounts = try readInputChannelCounts(of: outputID)
  let aggregateInputChannelCounts = try readInputChannelCounts(of: aggregateID)
  let tapIndex = outputInputChannelCounts.count
  let isTapAtIndex = aggregateInputChannelCounts.indices.contains(tapIndex) && aggregateInputChannelCounts[tapIndex] == tapChannelCount
  guard isTapAtIndex else {
    throw GouiError("The tap is not the input buffer after the output's own inputs. The aggregate inputs have \(aggregateInputChannelCounts) channels")
  }

  return UInt32(tapIndex)
}

// Core Audio answers a stream configuration in two calls: the size, then the list itself.
private func readInputChannelCounts(of device: AudioObjectID) throws -> [UInt32] {
  var address = propertyAddress(kAudioDevicePropertyStreamConfiguration, scope: kAudioObjectPropertyScopeInput)
  let step = "Reading \(fourCharacterCode(address.mSelector))"
  var byteCount: UInt32 = 0
  try throwIfFailed(AudioObjectGetPropertyDataSize(device, &address, 0, nil, &byteCount), step: step)

  // A device with no inputs still answers with the count of its list, never smaller than one buffer.
  let allocatedByteCount = max(Int(byteCount), MemoryLayout<AudioBufferList>.size)

  return try withUnsafeTemporaryAllocation(byteCount: allocatedByteCount, alignment: MemoryLayout<AudioBufferList>.alignment) { buffer in
    buffer.initializeMemory(as: UInt8.self, repeating: 0)
    try throwIfFailed(AudioObjectGetPropertyData(device, &address, 0, nil, &byteCount, buffer.baseAddress!), step: step)
    let bufferList = UnsafeMutableAudioBufferListPointer(buffer.baseAddress!.assumingMemoryBound(to: AudioBufferList.self))

    return bufferList.map { $0.mNumberChannels }
  }
}

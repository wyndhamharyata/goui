import CoreAudio
import Foundation
import Render

private let systemObject = AudioObjectID(kAudioObjectSystemObject)

// Undoes each built step in reverse order. A failed step is printed and the rest still run.
struct Teardown: @unchecked Sendable {
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

// The tap, the aggregate device and the running callback, built away from the main thread.
// The first build waits there until the person answers the permission prompt.
struct BuiltAudioPath: @unchecked Sendable {
  let outputID: AudioObjectID
  let aggregateID: AudioObjectID
  let render: OpaquePointer
  let summary: AudioPathSummary
  var teardown: Teardown

  static func build(sound: RenderSound) throws -> BuiltAudioPath {
    var teardown = Teardown()
    do {
      let outputID = try readProperty(of: systemObject, kAudioHardwarePropertyDefaultOutputDevice, as: AudioObjectID.self)
      let outputUID = try readString(of: outputID, kAudioDevicePropertyDeviceUID)
      let outputName = try readString(of: outputID, kAudioObjectPropertyName)

      let tapUUID = UUID()
      let tapID = try createTap(uuid: tapUUID)
      teardown.add("Destroying the tap") { AudioHardwareDestroyProcessTap(tapID) }
      let tapChannelCount = try readTapChannelCount(tapID)

      let aggregateID = try createAggregateDevice(outputUID: outputUID, tapUUID: tapUUID)
      teardown.add("Destroying the aggregate device") { AudioHardwareDestroyAggregateDevice(aggregateID) }
      let sampleRateHz = try readProperty(of: aggregateID, kAudioDevicePropertyNominalSampleRate, as: Float64.self)
      guard sampleRateHz > 0 else { throw AudioError("The output reports a sample rate of \(sampleRateHz) Hz") }
      let tapBufferIndex = try findTapBufferIndex(outputID: outputID, aggregateID: aggregateID, tapChannelCount: tapChannelCount)

      let createdRender = sound.bands.withUnsafeBufferPointer { bands in
        renderStateCreate(sound.preampDb, bands.baseAddress, UInt32(bands.count), sampleRateHz, tapChannelCount, tapBufferIndex)
      }
      guard let render = createdRender else {
        throw AudioError("Creating the render state failed. Memory ran out or atomic float is not lock-free here")
      }
      teardown.add("Freeing the render state") { renderStateDestroy(render); return noErr }

      var createdIOProcID: AudioDeviceIOProcID?
      try throwIfFailed(AudioDeviceCreateIOProcID(aggregateID, renderAudio, UnsafeMutableRawPointer(render), &createdIOProcID), step: "Creating the audio callback")
      guard let ioProcID = createdIOProcID else { throw AudioError("Creating the audio callback returned no callback") }
      teardown.add("Destroying the audio callback") { AudioDeviceDestroyIOProcID(aggregateID, ioProcID) }
      try throwIfFailed(AudioDeviceStart(aggregateID, ioProcID), step: "Starting the aggregate device")
      teardown.add("Stopping the aggregate device") { AudioDeviceStop(aggregateID, ioProcID) }

      let summary = try readSummary(aggregateID: aggregateID, outputName: outputName, sampleRateHz: sampleRateHz, tapChannelCount: tapChannelCount)
      return BuiltAudioPath(outputID: outputID, aggregateID: aggregateID, render: render, summary: summary, teardown: teardown)
    } catch {
      teardown.runAll()
      throw error
    }
  }
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
  let outputInputChannelCounts = try readInputChannelCounts(of: outputID)
  let aggregateInputChannelCounts = try readInputChannelCounts(of: aggregateID)
  let tapIndex = outputInputChannelCounts.count
  let isTapAtIndex = tapIndex < aggregateInputChannelCounts.count && aggregateInputChannelCounts[tapIndex] == tapChannelCount
  guard isTapAtIndex else {
    throw AudioError("The tap is not the input buffer after the output's own inputs. The aggregate inputs have \(aggregateInputChannelCounts) channels")
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

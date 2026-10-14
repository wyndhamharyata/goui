import CoreAudio

struct AudioError: Error, CustomStringConvertible {
  let description: String

  init(_ description: String) {
    self.description = description
  }

  init(step: String, status: OSStatus) {
    description = "\(step) failed with \(fourCharacterCode(UInt32(bitPattern: status)))"
  }
}

func throwIfFailed(_ status: OSStatus, step: String) throws {
  if status != noErr { throw AudioError(step: step, status: status) }
}

// Core Audio packs most of its codes and selectors as four ASCII characters.
func fourCharacterCode(_ value: UInt32) -> String {
  let bytes = withUnsafeBytes(of: value.bigEndian) { Array($0) }
  let isPrintable = bytes.allSatisfy { (32...126).contains($0) }
  return isPrintable ? "'\(String(decoding: bytes, as: UTF8.self))'" : "\(Int32(bitPattern: value))"
}

func propertyAddress(_ selector: AudioObjectPropertySelector, scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
}

func readProperty<Value: BitwiseCopyable>(of object: AudioObjectID, _ selector: AudioObjectPropertySelector, scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal, as type: Value.Type) throws -> Value {
  var address = propertyAddress(selector, scope: scope)
  let expectedByteCount = MemoryLayout<Value>.size
  var byteCount = UInt32(expectedByteCount)
  let step = "Reading \(fourCharacterCode(selector))"
  return try withUnsafeTemporaryAllocation(byteCount: expectedByteCount, alignment: MemoryLayout<Value>.alignment) { buffer in
    buffer.initializeMemory(as: UInt8.self, repeating: 0)
    try throwIfFailed(AudioObjectGetPropertyData(object, &address, 0, nil, &byteCount, buffer.baseAddress!), step: step)
    guard byteCount == expectedByteCount else {
      throw AudioError("\(step) returned \(byteCount) bytes instead of \(expectedByteCount)")
    }
    return buffer.load(as: Value.self)
  }
}

func readString(of object: AudioObjectID, _ selector: AudioObjectPropertySelector) throws -> String {
  let value = try readProperty(of: object, selector, as: Unmanaged<CFString>?.self)
  return value?.takeRetainedValue() as String? ?? ""
}

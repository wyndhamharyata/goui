import CoreAudio
import Foundation

final class PropertyListener {
  private let object: AudioObjectID
  private var address: AudioObjectPropertyAddress
  private var block: AudioObjectPropertyListenerBlock?

  init(object: AudioObjectID, selector: AudioObjectPropertySelector, scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal, handler: @escaping @MainActor () -> Void) throws {
    self.object = object
    address = propertyAddress(selector, scope: scope)
    // Core Audio calls the block on the main queue given below.
    let block: AudioObjectPropertyListenerBlock = { _, _ in MainActor.assumeIsolated { handler() } }
    let status = AudioObjectAddPropertyListenerBlock(object, &address, DispatchQueue.main, block)
    try throwIfFailed(status, step: "Listening to \(fourCharacterCode(selector))")
    self.block = block
  }

  func cancel() {
    guard let block else { return }
    self.block = nil
    let status = AudioObjectRemovePropertyListenerBlock(object, &address, DispatchQueue.main, block)
    if status != noErr {
      print(AudioError(step: "Removing the listener for \(fourCharacterCode(address.mSelector))", status: status))
    }
  }

  deinit {
    cancel()
  }
}

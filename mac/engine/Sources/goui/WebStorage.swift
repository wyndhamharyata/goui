import Foundation
import GouiEngine

// chrome.storage.local for the panel, kept in ~/Library/Application Support/goui/storage.json.
@MainActor
final class WebStorage {
  // The AutoEQ index is most of the bytes, so it has its own file, read only when the panel asks for it.
  private static let fileKeys = ["autoEqIndex": SupportFile.autoEqIndexURL]

  private var items: [String: Any]

  init() {
    let data = try? Data(contentsOf: SupportFile.storageURL)
    let saved = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }

    items = saved ?? [:]
    moveFileKeysOut()
  }

  // nil keys reads every item, as in Chrome.
  func read(_ keys: [String]?) -> [String: Any] {
    let names = keys ?? Array(items.keys) + Array(Self.fileKeys.keys)
    var found = items.filter { names.contains($0.key) }

    for name in names {
      if let url = Self.fileKeys[name], let value = Self.readFile(url) { found[name] = value }
    }

    return found
  }

  func write(_ newItems: [String: Any]) throws {
    guard JSONSerialization.isValidJSONObject(newItems) else { throw GouiError("Storage takes only values JSON can hold") }

    var smallItems = newItems

    for (name, url) in Self.fileKeys {
      if let value = smallItems.removeValue(forKey: name) { try Self.writeFile(value, to: url) }
    }

    guard !smallItems.isEmpty else { return }

    items.merge(smallItems) { _, new in new }
    save()
  }

  func remove(_ keys: [String]) {
    for key in keys {
      items.removeValue(forKey: key)
      if let url = Self.fileKeys[key] { try? FileManager.default.removeItem(at: url) }
    }

    save()
  }

  // A storage.json written by goui 0.2.5 or older holds the index too.
  private func moveFileKeysOut() {
    var isMoved = false

    for (name, url) in Self.fileKeys {
      guard let value = items[name], (try? Self.writeFile(value, to: url)) != nil else { continue }

      items.removeValue(forKey: name)
      isMoved = true
    }

    if isMoved { save() }
  }

  private func save() {
    do {
      try JSONSerialization.data(withJSONObject: items).write(to: SupportFile.storageURL, options: .atomic)
    } catch {
      print("The panel's storage could not be written. \(error)")
    }
  }

  // The index is one JSON string, so the file is read and written with fragments allowed.
  private static func readFile(_ url: URL) -> Any? {
    guard let data = try? Data(contentsOf: url) else { return nil }

    return try? JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed)
  }

  private static func writeFile(_ value: Any, to url: URL) throws {
    try JSONSerialization.data(withJSONObject: value, options: .fragmentsAllowed).write(to: url, options: .atomic)
  }
}

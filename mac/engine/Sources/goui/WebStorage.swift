import Foundation

// chrome.storage.local for the panel, kept in ~/Library/Application Support/goui/storage.json.
@MainActor
final class WebStorage {
  static let fileURL = SupportFolder.file("storage.json")

  private var items: [String: Any]

  init() {
    let data = try? Data(contentsOf: Self.fileURL)
    items = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
  }

  // nil keys reads every item, as in Chrome.
  func read(_ keys: [String]?) -> [String: Any] {
    guard let keys else { return items }

    return items.filter { keys.contains($0.key) }
  }

  func write(_ newItems: [String: Any]) throws {
    guard JSONSerialization.isValidJSONObject(newItems) else { throw BridgeError(description: "Storage takes only values JSON can hold") }

    items.merge(newItems) { _, new in new }
    save()
  }

  func remove(_ keys: [String]) {
    for key in keys { items.removeValue(forKey: key) }
    save()
  }

  private func save() {
    do {
      try SupportFolder.write(JSONSerialization.data(withJSONObject: items), to: Self.fileURL)
    } catch {
      print("The panel's storage could not be written. \(error)")
    }
  }
}

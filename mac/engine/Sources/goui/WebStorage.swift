import Foundation
import GouiEngine

// chrome.storage.local for the panel, kept in ~/Library/Application Support/goui/storage.json.
@MainActor
final class WebStorage {
  static let fileURL = supportFolderURL.appending(path: "storage.json")

  private var items: [String: Any]

  init() {
    let data = try? Data(contentsOf: Self.fileURL)
    let saved = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }

    items = saved ?? [:]
  }

  // nil keys reads every item, as in Chrome.
  func read(_ keys: [String]?) -> [String: Any] {
    guard let keys else { return items }

    return items.filter { keys.contains($0.key) }
  }

  // The panel keeps its Sets under sets, by name, in the same order as its own list.
  func listSetNames() -> [String] {
    let sets = items["sets"] as? [String: Any] ?? [:]

    return sets.keys.sorted { $0.localizedCompare($1) == .orderedAscending }
  }

  func write(_ newItems: [String: Any]) throws {
    guard JSONSerialization.isValidJSONObject(newItems) else { throw GouiError("Storage takes only values JSON can hold") }

    items.merge(newItems) { _, new in new }
    save()
  }

  func remove(_ keys: [String]) {
    for key in keys { items.removeValue(forKey: key) }
    save()
  }

  private func save() {
    do {
      try JSONSerialization.data(withJSONObject: items).write(to: Self.fileURL, options: .atomic)
    } catch {
      print("The panel's storage could not be written. \(error)")
    }
  }
}

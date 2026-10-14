import CoreGraphics
import Foundation
let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] ?? []
for w in list {
  let layer = w[kCGWindowLayer as String] as? Int ?? -1
  if layer != 0 { continue }
  let owner = w[kCGWindowOwnerName as String] as? String ?? "?"
  let pid = w[kCGWindowOwnerPID as String] as? Int ?? 0
  let id = w[kCGWindowNumber as String] as? Int ?? 0
  let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
  print("\(id)\t\(pid)\t\(owner)\t\(b["Width"] ?? 0)x\(b["Height"] ?? 0)")
}

import AppKit
let args = CommandLine.arguments
let img = NSBitmapImageRep(data: try! Data(contentsOf: URL(fileURLWithPath: args[1])))!
for p in args.dropFirst(2) {
  let xy = p.split(separator: ",").map { Int($0)! }
  let c = img.colorAt(x: xy[0], y: xy[1])!.usingColorSpace(.sRGB)!
  print(p, String(format: "#%02x%02x%02x", Int(c.redComponent*255), Int(c.greenComponent*255), Int(c.blueComponent*255)))
}

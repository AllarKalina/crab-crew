// A Raster's `cells`: base64 of little-endian u32 triplets [codePoint, foreground, background].
export const DEFAULT = 0x01000000
export const pack = (cells: number[][]): string => {
  const words = new Uint32Array(cells.length * 3)
  cells.forEach((cell, i) => words.set(cell, i * 3))
  return (new Uint8Array(words.buffer) as unknown as { toBase64(): string }).toBase64()
}

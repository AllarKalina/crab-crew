// Text helpers shared by the band, the pane and their drawings: short model names,
// readable numbers, escaping for SVG, and trimming a string to a cell or pixel budget.

const FAMILIES = ['fable', 'mythos', 'opus', 'sonnet', 'haiku']
// "<family>-<major>" with an optional one- or two-digit "-<minor>"; a longer digit
// run after the major is a date stamp, not a minor version.
const FAMILY_VERSION = new RegExp(`(${FAMILIES.join('|')})-(\\d+)(?:-(\\d{1,2})(?!\\d))?`, 'i')

const capitalised = (word: string): string => {
  const lower = word.toLowerCase()
  return lower.slice(0, 1).toUpperCase() + lower.slice(1)
}

// "claude-opus-4-1-20250805" → "Opus 4.1". An id outside the known families keeps its
// own spelling, minus the vendor prefix and any "[...]" variant tag.
export const modelName = (modelId: string): string => {
  const hit = FAMILY_VERSION.exec(modelId)
  if (hit === null) {
    const bare = modelId.replace(/^claude-/, '').replace(/\[.*\]$/, '')
    return bare === '' ? '—' : bare
  }
  const [, family = '', major = '', minor] = hit
  const version = minor ? `${major}.${minor}` : major
  return `${capitalised(family)} ${version}`
}

export const fmtTokens = (count: number): string => {
  if (count >= 1e6) return (count / 1e6).toFixed(1) + 'M'
  if (count >= 1e3) return Math.round(count / 1e3) + 'k'
  return String(Math.round(count))
}

// Cents under ten dollars, dimes from there on.
export const fmtCost = (dollars: number): string => '$' + dollars.toFixed(dollars < 10 ? 2 : 1)

const pad2 = (n: number): string => String(n).padStart(2, '0')

// Elapsed time as m:ss, or h:mm:ss once it passes the hour.
export const fmtTime = (elapsedMs: number): string => {
  const secs = Math.max(0, Math.round(elapsedMs / 1000))
  const hours = Math.floor(secs / 3600)
  const mins = Math.floor((secs - hours * 3600) / 60)
  const tail = pad2(secs % 60)
  return hours ? `${hours}:${pad2(mins)}:${tail}` : `${mins}:${tail}`
}

const ENTITY: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }
export const xml = (raw: string): string => raw.replace(/["&<>]/g, c => ENTITY[c] ?? c)

// The form two task titles are matched in (never displayed): letters and digits
// only, lower-cased, runs of anything else folded to one space.
export const normTitle = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

// Split into user-perceived characters so a cut never lands inside an emoji sequence
// or between a letter and its combining marks; plain code points as a fallback.
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter() : null
const graphemes = (s: string): string[] => (segmenter ? Array.from(segmenter.segment(s), g => g.segment) : [...s])

// Every cut ends the same way: trailing space dropped, then one "…".
const ellipsis = (kept: string): string => kept.trimEnd() + '…'

// Code point ranges drawn double width: Hangul jamo, the CJK blocks, Hangul
// syllables, compatibility and fullwidth forms, emoji, and the supplementary
// ideograph planes.
const DOUBLE: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff01, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
]
const inDouble = (cp: number): boolean => DOUBLE.some(([lo, hi]) => cp >= lo && cp <= hi)
// True when any code point of `text` falls in one of the ranges above.
const hasDouble = (text: string): boolean => Array.from(text, c => c.codePointAt(0) ?? 0).some(inDouble)

// Approximate glyph advance in the desktop UI font, as a fraction of the font size.
// Only used to budget space for a title, so four buckets do. Cyrillic gets the
// same wide letters as Latin, since titles follow the user's language.
const THIN = /[()[\]\s.,:;'|!1il]/
const BROAD = /[@%A-ZmwЁА-ЯМШЩЖЮшщжю]/
const advance = (ch: string): number => {
  if (hasDouble(ch)) return 1
  if (THIN.test(ch)) return 0.3
  if (BROAD.test(ch)) return 0.72
  return 0.56
}

export const textWidth = (text: string, px: number): number => {
  let w = 0
  for (const c of text) w += advance(c) * px
  return w
}

// Longest prefix of `text` that, with a trailing "…", stays within `maxW` pixels.
// Strings that already fit come back untouched.
export const fitText = (text: string, px: number, maxW: number): string => {
  const whole = textWidth(text, px)
  if (whole <= maxW) return text
  const tail = advance('…') * px
  let kept = ''
  let w = 0
  for (const c of text) {
    const step = advance(c) * px
    if (w + step + tail > maxW) break
    kept += c
    w += step
  }
  return ellipsis(kept)
}

// Terminal columns a string occupies: two for each double-width character.
const columns = (g: string): number => (hasDouble(g) ? 2 : 1)
export const cells = (s: string): number => graphemes(s).reduce((sum, g) => sum + columns(g), 0)

// Trims to at most `max` characters; the last one becomes "…" when anything is lost.
export const clip = (text: string, max: number): string => {
  const parts = graphemes(text)
  if (parts.length <= max) return text
  return ellipsis(parts.slice(0, Math.max(1, max - 1)).join(''))
}

// Trims to at most `max` terminal columns, keeping one column for the "…".
export const clipCells = (text: string, max: number): string => {
  if (cells(text) <= max) return text
  const room = max - 1
  let kept = ''
  let used = 0
  for (const g of graphemes(text)) {
    const need = columns(g)
    if (used + need > room) break
    kept += g
    used += need
  }
  return ellipsis(kept)
}

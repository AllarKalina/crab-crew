import type { Role } from '../types'
import type { Glyphs } from './glyphs'
import { colorOf } from './roles'
import type { BarState } from './term-bar'
import { BAND, M, blend, contrast, hex, rgb } from './theme'

// The crab that walks at the head of the band's track, drawn as Text: a Raster draws
// BMP glyphs only, and its octants are not.
// Besides what band.tsx draws with, CRAB_FRAMES, CRAB_REST, PLAIN_FRAMES, PLAIN_REST and
// LAP are exported for the tests alone.

// The band's crab, sixteen pixels by four in octants (2×4 per cell), seen from the
// front: both claws raised, open, either side of a wide shell with two eyes (holes),
// six legs beneath. Pixel columns 0 and 15 are empty, so a column of track always
// stands between its claw and the pill's rounded head, and between its other claw
// and what drifts beyond. Only its legs move:
//   A rest              R right legs step in    L left legs step in
//   .X.X..XXXX..X.X.    .X.X..XXXX..X.X.        .X.X..XXXX..X.X.
//   .XXXXX.XX.XXXXX.    .XXXXX.XX.XXXXX.        .XXXXX.XX.XXXXX.
//   ..XXXXXXXXXXXX..    ..XXXXXXXXXXXX..        ..XXXXXXXXXXXX..
//   ..X.X.X..X.X.X..    ..X.X.X.X.X.X...        ...X.X.X.X.X.X..
// Each cell is the BLOCK OCTANT named by its pixels, numbered 1-8 left to right, top
// to bottom, but for the two claw tips, whose pixels name a QUADRANT instead (24 is
// UPPER RIGHT, 13 UPPER LEFT): 24, 234567, 34567, 124567, 123568, 34568, 134568, 13
// (A); 24, 234567, 34567, 124567, 123567, 34567, 134567, 13 (R); 24, 234568, 34568,
// 124568, 123568, 34568, 134568, 13 (L).
export const CRAB_FRAMES = {
  A: '▝\u{1cd6f}\u{1cd6d}\u{1cd6c}\u{1cda3}\u{1cda8}\u{1cda9}▘',
  R: '▝\u{1cd6f}\u{1cd6d}\u{1cd6c}\u{1cd68}\u{1cd6d}\u{1cd6e}▘',
  L: '▝\u{1cdaa}\u{1cda8}\u{1cda7}\u{1cda3}\u{1cda8}\u{1cda9}▘',
} as const
export const CRAB = CRAB_FRAMES.A
// The crab at rest beside the percentage, where the row has room for six cells, not
// eight: the same crab twelve pixels wide, its claws in close by the shell, and no
// column of track to keep clear at either end:
//   X.X.XXXX.X.X
//   .XXX.XX.XXX.
//   ..XXXXXXXX..
//   .X.X.XX.X.X.
// BLOCK OCTANT-148, 134568, 124568, 123567, 234567, 237.
export const CRAB_REST = '\u{1cd79}\u{1cda9}\u{1cda7}\u{1cd68}\u{1cd6f}\u{1cd3b}'

// Without a font that has the octants (the `plain` glyphs), the same crab in ASCII:
// raised pincers either side of a shell with two eyes, six cells, in every font. In
// the track's eight cells it scuttles sideways a cell either way. Shuffled left it
// meets the pill's head, a left half block there: half a cell of track still parts them.
export const PLAIN_FRAMES = { A: ' V(oo)V ', R: '  V(oo)V', L: 'V(oo)V  ' } as const
export const PLAIN_REST = 'V(oo)V'

// Each glyph set's crab: its frames in the track, and the one at rest beside the percentage.
export const CRABS = {
  nerd: { frames: CRAB_FRAMES, rest: CRAB_REST },
  plain: { frames: PLAIN_FRAMES, rest: PLAIN_REST },
} as const satisfies Record<Glyphs, { frames: { A: string; R: string; L: string }; rest: string }>

// One side's legs step in, then the other's: a sideways scuttle.
const walkOf = ({ frames: { A, R, L } }: (typeof CRABS)[Glyphs]): string[] => [A, R, A, L]
const WALKS: Record<Glyphs, string[]> = { nerd: walkOf(CRABS.nerd), plain: walkOf(CRABS.plain) }
const WALK_LEN = 4

// Every 3 cycles it stops at rest for 4 ticks: a crab that never stops tires the eye.
const PAUSE = 4
export const LAP = 3 * 2 * WALK_LEN + PAUSE

// A frame every 2 ticks, every tick while it hurries; at rest while no agent runs.
// A scuttle runs through the pauses. From the shared tick, so a redraw does not
// restart the cycle.
export const crabFrame = (state: BarState, tick: number): string => {
  const walk = WALKS[state.glyphs]
  const still = walk[0]!
  if (!state.isWalking) return still
  if (tick < state.hurryUntil) return walk[tick % WALK_LEN]!
  const at = tick % LAP
  return at >= LAP - PAUSE ? still : walk[Math.floor(at / 2) % WALK_LEN]!
}

// The walking crab's colour on the track: its role's, taken toward Mocha's text in
// steps of a twentieth just far enough to stand 4.5 to 1 off the track, as clear as
// the dimmest accent, the builder's blue. Only the plain crab's grey needs it.
const TINT_MIN = 4.5
export const tintOf = (role: Role): string => {
  const color = colorOf(role)
  for (let k = 0; k <= 20; k++) {
    const c = hex(blend(rgb(color), rgb(M.text), k / 20))
    if (contrast(c, BAND.track) >= TINT_MIN) return c
  }
  return M.text
}

// A step forward makes it scuttle for a moment. A first draw or a step back does
// not; a redraw at the same progress keeps the scuttle already under way.
const HURRY = 8
export const hurryOf = (prev: BarState | undefined, ratio: number, tick: number): number =>
  !prev ? 0 : ratio > prev.ratio ? tick + HURRY : prev.hurryUntil

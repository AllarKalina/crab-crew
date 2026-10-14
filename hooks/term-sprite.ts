import type { Role } from '../types'
import { DEFAULT, pack } from './raster'
import { colorOf } from './roles'
import { CLAY, M, PROP, blend, rgb, word } from './theme'
import type { Rgb } from './theme'

// The crab sprites, one per role: 14 by 8 pixels. A terminal shows them two pixels
// to a cell in half blocks, four rows of one Raster; the desktop draws the very same
// sprites as SVG (svg-crab.ts).
export const CRAB_COLS = 14
export const CRAB_ROWS = 4

// The sprites' wood: a brown light enough to stand out on Mocha's base.
const WOOD = '#8a5a36'

// Rows 0-6 of each sprite; row 7 is the legs. `C` is the body, `k` an eye, `t` the
// role's color, the rest each sprite's own.
const BODY = ['..CCCCCCCC....', '..CkCCCCkC....', 'CCCCCCCCCCCC..', '..CCCCCCCC....']
// The right claw raised, holding whatever stands on column 12.
const HOLD = ['..CkCCCCkCCCC.', 'CCCCCCCCCC....', '..CCCCCCCC....']

type Sprite = { rows: string[]; ink: Record<string, string> }

// Shared with svg-crab.ts, which draws the same sprites, and with the tests: rows of
// 14 pixels, every letter mapped to an ink.
export const SPRITES: Record<Role, Sprite> = {
  // Painter: beret, brush, a dab of paint.
  designer: {
    rows: ['.....dd.....y.', '...tttttt...y.', '.tttttttttt.b.', 's.CCCCCCCC..b.', ...HOLD],
    ink: { d: '#b4578f', y: M.yellow, b: WOOD, s: M.sky },
  },
  // Detective: deerstalker and magnifier.
  reviewer: {
    rows: ['....bbbb...ooo', '..bbbbbbbb.ogo', '.ddddddddddooo', '..CCCCCCCC..h.', ...HOLD],
    ink: { b: WOOD, d: '#5f3d22', o: M.overlay1, g: M.sky, h: WOOD },
  },
  // Pirate: tricorn, eyepatch, cutlass.
  scout: {
    rows: ['..hh......hh..', '..hhhhwwhhhh..', '.yyyyyyyyyy.s.', '..CCCCCCCC..s.', '..CkCCCkkk..s.', 'CCCCCCCCCCCCb.', '..CCCCCCCC....'],
    ink: { h: M.surface2, w: M.text, y: PROP.gold, s: M.subtext0, b: WOOD },
  },
  // Engineer: hard hat and wrench.
  planner: {
    rows: ['....yyyyyy....', '...yyyhhyyy...', '.dddddddddd...', 'w.CCCCCCCC....', 'w.CkCCCCkC....', 'CCCCCCCCCCCC..', '..CCCCCCCC....'],
    ink: { y: PROP.gold, h: M.yellow, d: PROP.goldDark, w: M.overlay1 },
  },
  // Chef: toque, a pan and an egg.
  builder: {
    rows: ['...wwwwww.....', '..wwwwwwww....', '..tttttttt.ee.', '..CCCCCCCCpppp', '..CkCCCCkCCC..', 'CCCCCCCCCC....', '..CCCCCCCC....'],
    ink: { w: '#eff1f5', e: M.yellow, p: M.surface2 },
  },
  // Racer: helmet and checkered flag.
  runner: {
    rows: ['...tttttt.pwk.', '..tttwwtttpkw.', '..kkkkkkkkp...', '..CCCCCCCCp...', '..CkCCCCkCCC..', 'CCCCCCCCCC....', '..CCCCCCCC....'],
    ink: { w: '#eff1f5', p: M.overlay1 },
  },
  // Astronaut: glass dome, antenna, a star.
  fork: {
    rows: ['.....tt.....y.', '.gggggggggg...', '.gGGGGGGGGg...', '.gPPPPPPPPg...', '.gPkPPPPkPg...', 'CgPPPPPPPPgC..', '.ggggttgggg...'],
    ink: { g: '#dce0e8', G: '#3b4261', P: '#d99a86', y: M.yellow },
  },
  other: { rows: ['..............', '..............', '..............', ...BODY], ink: {} },
}

// A running crab scuttles: its legs change places.
export const LEGS = ['..C.C..C.C....', '...C.CC.C.....']

// What each letter of a role's sprite paints, in the terminal and on the desktop alike.
export const inkOf = (role: Role): Record<string, string> => ({ C: CLAY, k: M.crust, t: colorOf(role), ...SPRITES[role].ink })

const cache = new Map<string, string>()

// A Raster's `cells` for a role's crab. `frame` 0 or 1 steps; a dimmed crab is a planned
// task's. Empty pixels take whatever is drawn behind the Raster.
export const crabCells = (role: Role, frame: number | null = null, dim = false): string => {
  const key = `${role}|${frame}|${dim}`
  const empty = DEFAULT
  const hit = cache.get(key)
  if (hit) return hit
  const ink = inkOf(role)
  const rows = [...SPRITES[role].rows, LEGS[frame ?? 0]!]
  const at = (x: number, y: number): Rgb | null => {
    const hex = ink[rows[y]?.[x] ?? '.']
    if (!hex) return null
    return dim ? blend(rgb(hex), rgb(M.base), 0.6) : rgb(hex)
  }
  const cells: number[][] = []
  for (let row = 0; row < CRAB_ROWS; row++) {
    for (let col = 0; col < CRAB_COLS; col++) {
      const top = at(col, row * 2)
      const bottom = at(col, row * 2 + 1)
      cells.push(top ? [0x2580, word(top), bottom ? word(bottom) : empty] : bottom ? [0x2584, word(bottom), empty] : [0x20, DEFAULT, empty])
    }
  }
  const packed = pack(cells)
  cache.set(key, packed)
  return packed
}

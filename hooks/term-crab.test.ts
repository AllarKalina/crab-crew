import { expect, test } from 'claude-code/testing'

import { ROLES, colorOf } from './roles'
import { CRAB_CELLS, REST_CELLS } from './term-bar'
import type { BarState } from './term-bar'
import { CRAB, CRAB_FRAMES, CRAB_REST, LAP, crabFrame, hurryOf, tintOf } from './term-crab'
import { bar } from './testkit'
import { BAND, M, contrast } from './theme'

// Each octant cell is 2 by 4 pixels, numbered 1-8 left to right, top to bottom.
// Each named BLOCK OCTANT-<cells> in UnicodeData 16, but for the two claw tips, a
// QUADRANT: U+259D QUADRANT UPPER RIGHT (2 and 4), U+2598 QUADRANT UPPER LEFT (1 and 3).
const OCTANTS: Record<number, string> = {
  0x259d: '24',
  0x2598: '13',
  0x1cd68: '123567',
  0x1cd6c: '124567',
  0x1cd6d: '34567',
  0x1cd6e: '134567',
  0x1cd6f: '234567',
  0x1cda3: '123568',
  0x1cda7: '124568',
  0x1cda8: '34568',
  0x1cda9: '134568',
  0x1cdaa: '234568',
  0x1cd79: '148',
  0x1cd3b: '237',
}
const pixels = (frame: string): string[] =>
  [0, 1, 2, 3].map(row =>
    [...frame].map(c => [1, 2].map(side => (OCTANTS[c.codePointAt(0)!]!.includes(String(row * 2 + side)) ? 'X' : '.')).join('')).join(''),
  )

test('crab: only the legs move between frames', () => {
  const body = ['.X.X..XXXX..X.X.', '.XXXXX.XX.XXXXX.', '..XXXXXXXXXXXX..']
  expect(pixels(CRAB_FRAMES.A)).toEqual([...body, '..X.X.X..X.X.X..'])
  expect(pixels(CRAB_FRAMES.R)).toEqual([...body, '..X.X.X.X.X.X...'])
  expect(pixels(CRAB_FRAMES.L)).toEqual([...body, '...X.X.X.X.X.X..'])
  expect(CRAB).toBe(CRAB_FRAMES.A)
})

test('crab: at rest beside the percentage it is the same crab in the row\'s six cells', () => {
  expect([...CRAB_REST].length).toBe(REST_CELLS)
  expect(Object.values(CRAB_FRAMES).map(f => [...f].length)).toEqual([CRAB_CELLS, CRAB_CELLS, CRAB_CELLS])
  const rows = pixels(CRAB_REST)
  expect(rows).toEqual(['X.X.XXXX.X.X', '.XXX.XX.XXX.', '..XXXXXXXX..', '.X.X.XX.X.X.'])
  // Raised open claws, two eyes enclosed in the shell, six legs.
  expect(rows.slice(0, 2).map(r => r.slice(0, 3) + r.slice(9))).toEqual(['X.XX.X', '.XXXX.'])
  expect([4, 7].map(c => rows.slice(0, 3).map(r => r[c]).join(''))).toEqual(['X.X', 'X.X'])
  expect(rows[3]!.split('X').length - 1).toBe(6)
  for (const c of CRAB_REST) expect(['1', '2', '35', '46', '7', '8']).not.toContain(OCTANTS[c.codePointAt(0)!])
})

test('crab: walks a frame every 2 ticks, every tick while it hurries, and rests while nobody runs', () => {
  const { A, R, L } = CRAB_FRAMES
  const frames = (state: BarState, from = 0) => Array.from({ length: 8 }, (_, i) => crabFrame(state, from + i))
  expect(frames(bar())).toEqual([A, A, R, R, A, A, L, L])
  expect(frames(bar({ hurryUntil: 8 }))).toEqual([A, R, A, L, A, R, A, L])
  expect(frames(bar({ hurryUntil: 8 }), 8)).toEqual([A, A, R, R, A, A, L, L])
  expect(frames(bar({ isWalking: false }))).toEqual(Array(8).fill(A))
})

test('crab: every 3 cycles it rests in pose A for 4 ticks, and a scuttle runs through', () => {
  const { A, R, L } = CRAB_FRAMES
  const frames = (state: BarState, from: number, n: number) => Array.from({ length: n }, (_, i) => crabFrame(state, from + i))
  expect(LAP).toBe(28)
  // Three cycles of A, R, A, L at 2 ticks a frame, then A held on into the next lap.
  const lap = frames(bar(), 0, LAP)
  expect(lap.slice(0, 24)).toEqual(Array(3).fill([A, A, R, R, A, A, L, L]).flat())
  expect(lap.slice(24)).toEqual(Array(4).fill(A))
  expect(frames(bar(), LAP, 4)).toEqual([A, A, R, R])
  // The same lap later on: the pause comes from the shared tick.
  expect(frames(bar(), 5 * LAP, LAP)).toEqual(lap)
  // The scuttle after a step forward ignores the pause.
  expect(frames(bar({ hurryUntil: LAP + 4 }), 20, 12)).toEqual(Array(3).fill([A, R, A, L]).flat())
})

test('crab: claws raised either side of a shell with two eyes, six legs, and a column of track at either end', () => {
  for (const frame of Object.values(CRAB_FRAMES)) {
    expect([...frame].length).toBe(8)
    const rows = pixels(frame)
    // Pixel columns 0 and 15 are track: a clear column between the claw and the
    // pill's rounded head, and past the other claw.
    expect(rows.map(r => r[0]! + r[15]!)).toEqual(['..', '..', '..', '..'])
    // Each claw is raised and open: two tips on row 0, a gap between, joined on row 1.
    expect(rows.slice(0, 2).map(r => r.slice(1, 4))).toEqual(['X.X', 'XXX'])
    expect(rows.slice(0, 2).map(r => r.slice(12, 15))).toEqual(['X.X', 'XXX'])
    // The shell's top stands apart from the claws' tips.
    expect(rows[0]!.slice(4, 12)).toBe('..XXXX..')
    // The eyes are holes in the shell, in columns 6 and 9, solid above and below.
    expect([6, 9].map(c => rows.slice(0, 3).map(r => r[c]).join(''))).toEqual(['X.X', 'X.X'])
    // Six legs, none touching the next.
    expect(rows[3]!.split('X').length - 1).toBe(6)
    expect(rows[3]).not.toContain('XX')
    // No cell is one of the patterns kept out of the sprite: 1, 2, 3+5, 4+6, 7, 8.
    for (const c of frame) expect(['1', '2', '35', '46', '7', '8']).not.toContain(OCTANTS[c.codePointAt(0)!])
  }
})

test('colors: every role\'s crab stands 4.5 to 1 off the track; only the grey is lifted, toward Mocha\'s text', () => {
  for (const role of ROLES) expect(`${role}: ${contrast(tintOf(role), BAND.track) >= 4.5}`).toBe(`${role}: true`)
  expect(ROLES.filter(role => tintOf(role) !== colorOf(role))).toEqual(['other'])
  const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  const [c, from, to] = [channels(tintOf('other')), channels(colorOf('other')), channels(M.text)]
  c.forEach((v, i) => expect(v).toBeGreaterThan(from[i]!))
  c.forEach((v, i) => expect(v).toBeLessThan(to[i]!))
})

test('crab: a step forward hurries it, a first draw or a step back does not', () => {
  expect(hurryOf(undefined, 0.5, 3)).toBe(0)
  expect(hurryOf(bar({ ratio: 0.25 }), 0.5, 3)).toBe(11)
  expect(hurryOf(bar({ ratio: 0.5, hurryUntil: 11 }), 0.5, 5)).toBe(11)
  expect(hurryOf(bar({ ratio: 0.5 }), 0.25, 5)).toBe(0)
})

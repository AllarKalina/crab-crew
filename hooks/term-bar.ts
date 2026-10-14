import { cells } from './format'
import { CAPS } from './glyphs'
import type { Glyphs } from './glyphs'
import { noise } from './noise'
import { DEFAULT, pack } from './raster'
import { BAND, blend, rgb, word } from './theme'

// The band's progress bar: a periwinkle pill that carries the label, grown to the
// flow's progress, and a dark track beyond it where stars drift and twinkle.
// The pill is Text (the label is bold); the track is a Raster a timer repaints.
// The crab at the head of the track is term-crab.ts.
// Besides what band.tsx draws with, the star and milestone geometry (DRIFT, lanesOf,
// lanesAt, starsOf, marksOf, DOTS, PAIRS, STAR_LOW, MARK), MARK_W and REST_CELLS are exported
// for the tests alone.

const TRACK = rgb(BAND.track)
const STAR = rgb(BAND.star)
const GLINT = rgb(BAND.fill)
const TICK = rgb(BAND.mark)
const LIT = rgb(BAND.markLit)

// One braille dot is a star, on one of the cell's two middle dot rows (dots 2 and 5,
// 3 and 6), left or right. The top and bottom rows sit on the track's edge pixel row.
export const DOTS = [0x2802, 0x2804, 0x2810, 0x2820]
// A brighter star: two dots side by side, on either middle row.
export const PAIRS = [0x2812, 0x2824]
// The dimmest a star twinkles down to, of the way from the track to its tone.
export const STAR_LOW = 0.45
// A task boundary still ahead: a thin bar the height of the cell, standing still.
export const MARK = 0x2502

// A lane's own noise: each star's beat, tone and glyph.
const laneNoise = (n: number): number => noise(n, 0, 4.1414)

export type BarState = {
  columns: number
  ratio: number
  isFinished: boolean
  // The bar's ends and the crab's frames: a Nerd Font's, or plain ones (glyphs.ts).
  glyphs: Glyphs
  label: string
  total: number
  done: number
  // An agent runs: the crab walks; otherwise it stands at rest.
  isWalking: boolean
  // The tick until which the crab scuttles at double speed after a step forward.
  hurryUntil: number
}

// Cells the pill takes, its left cap included and its rounded head not: the
// label always fits, so a flow at 0% still names its phase.
export const pillOf = ({ columns, ratio, isFinished, label }: BarState): number =>
  isFinished ? columns - 1 : Math.min(columns - 1, Math.max(label.length + 3, Math.round(ratio * columns) - 1))

// The crab walks in track cells 1-8, past the pill's rounded head in cell 0. It needs
// those, one free cell beyond its right claw, two cells of track beyond it so it
// never looks pinned to the end, and the right cap; short of that, and once the flow
// is done, it sits beside the percentage instead: one crab at a time. The two cells
// are room for a star to drift, not a promise of one: a lane's star is in them most
// of the time, and a milestone with its clear space may take both, but counting them
// past milestones would hop the crab in and out as boundaries pass.
const CRAB_AT = 1
export const CRAB_CELLS = 8
// The free cell, two of track, the cap.
const ROOM = 1 + 2 + 1
// Beside the percentage it rests six cells wide (`CRAB_REST`).
export const REST_CELLS = 6
export const crabInTrack = (state: BarState): boolean => !state.isFinished && state.columns - pillOf(state) >= CRAB_AT + CRAB_CELLS + ROOM

// The track cell the Raster starts at: past the pill's rounded head and the crab,
// Text both, when it walks there.
export const rasterAt = (state: BarState): number => (crabInTrack(state) ? CRAB_AT + CRAB_CELLS : 0)

// The engine draws its collapse mark, `[-]`, over the right end of the band's
// first row: the row keeps clear of it.
export const MARK_W = 4

// The band's row in the terminal: dot and title, the bar, the percentage (the
// crab beside it, at worst), the count and the ✕, `gap` apart. The bar takes what
// the rest leave, up to 56; the title gives way first, so the label always fits.
// The title is measured in cells: a CJK character or an emoji takes two.
export const fitRow = (cols: number, title: string, label: string, percent: string, count: string) => {
  const room = cols - MARK_W
  const gap = room < 60 ? 1 : 2
  const tail = 4 * gap + percent.length + 1 + REST_CELLS + count.length + 1
  const minBar = label.length + 5
  const fits = Math.min(34, cells(title), Math.floor(cols / 3), room - 2 - tail - minBar)
  // Under two cells a title has no room for a letter and its ellipsis: the dot
  // stands alone.
  const titleW = fits < 2 ? 0 : fits
  const barW = Math.max(minBar, Math.min(56, room - (titleW ? 2 + titleW : 1) - tail))
  return { gap, titleW, barW }
}

// Track cells of the task boundaries still ahead, past the pill's end: one the label's
// room swallows is in the pill, and the crab or its free cell may cover others,
// which are not drawn.
export const marksOf = ({ columns, total, done }: BarState, pill: number): Set<number> => {
  const marks = new Set<number>()
  for (let i = done + 1; i < total; i++) {
    const x = Math.round((columns * i) / total) - pill
    if (x > 0) marks.add(x)
  }
  return marks
}

// Stars drift along the whole bar, from its first column: it is cut into lanes of
// about 2.6 cells, one star to a lane at the lane's start, all at one slow pace, and
// they wrap from the bar's end to its start. Only those over the open stretch of
// track are drawn: past the head, or past the crab and its free cell, short of the
// cap. So they never meet or step back, spread evenly however much the crab covers,
// and a step forward only hides the stars the pill or the crab now covers: the
// others stay where they were. Each lane's star in view, `tick` frames on, by its
// track cell.
export const DRIFT = 0.04
export const lanesOf = (columns: number): number => Math.max(1, Math.min(Math.round(columns / 2.6), Math.floor(columns / 2)))
// Every lane's star, seen or not, by the bar's own column. Lanes of two cells or
// more, the stars at one place in each: two stars are always two cells apart or
// more, a clear cell between them, across the wrap from the bar's end to its start
// too, and any ten cells hold five at most.
export const lanesAt = (columns: number, tick: number): number[] => {
  const count = lanesOf(columns)
  return Array.from({ length: count }, (_, j) => Math.floor(((j * columns) / count + tick * DRIFT) % columns))
}
export const starsOf = (state: BarState, tick: number): Map<number, number> => {
  const pill = pillOf(state)
  const [lo, hi] = [rasterAt(state) + 1, state.columns - pill - 2]
  const stars = new Map<number, number>()
  lanesAt(state.columns, state.isFinished ? 0 : tick).forEach((at, j) => {
    const x = at - pill
    if (x >= lo && x <= hi) stars.set(j, x)
  })
  return stars
}

// The track from `rasterAt`: with the crab, its free cell; without it, the pill's
// rounded head. Then the stars and the milestones, then the right cap. `tick` counts
// frames of about 150ms; a finished bar holds still.
export const barCells = (state: BarState, tick: number): string => {
  const { columns, glyphs, isFinished } = state
  const pill = pillOf(state)
  const n = columns - pill
  const from = rasterAt(state)
  const fill = rgb(isFinished ? BAND.done : BAND.fill)
  const t = isFinished ? 0 : tick
  // The milestones drawn: past the crab's free cell or the head, short of the cap.
  const marks = new Set([...marksOf(state, pill)].filter(x => x > from && x < n - 1))

  const stars = new Map<number, number[]>()
  const behind = new Set<number>()
  for (const [j, x] of starsOf(state, t)) {
    // A star passes behind a milestone: the milestone brightens while it does.
    if (marks.has(x)) {
      behind.add(x)
      continue
    }
    // Clear space round a milestone: a star in the cell before or after one is not
    // drawn, and comes back to view a cell on, where it would have been anyway.
    if (marks.has(x - 1) || marks.has(x + 1)) continue
    // Each star breathes on its own beat, never dimmer than about half its tone so
    // it reads from a normal distance; a few are lit in the pill's colour, and a
    // quarter are two dots wide: every fourth, as noise over a dozen stars is lumpy.
    const beat = 0.5 + 0.5 * Math.sin(t * (0.08 + laneNoise(j + 5) * 0.1) + laneNoise(j + 31) * 6.3)
    const tone = laneNoise(j + 47) < 0.25 ? GLINT : STAR
    const dot = j % 4 === 2 ? PAIRS[Math.floor(laneNoise(j + 83) * PAIRS.length)]! : DOTS[Math.floor(laneNoise(j + 59) * DOTS.length)]!
    stars.set(x, [dot, word(blend(TRACK, tone, STAR_LOW + (1 - STAR_LOW) * beat))])
  }

  const out: number[][] = []
  for (let i = from; i < n; i++) {
    if (i === 0) out.push([CAPS[glyphs][1], word(fill), n === 1 ? DEFAULT : word(TRACK)])
    else if (i === n - 1) out.push([CAPS[glyphs][1], word(TRACK), DEFAULT])
    // A cell of plain track keeps stars and marks off the crab's right claw; a mark
    // the crab or this cell covers is not drawn.
    else if (i === from) out.push([0x20, DEFAULT, word(TRACK)])
    else if (marks.has(i)) out.push([MARK, word(behind.has(i) ? LIT : TICK), word(TRACK)])
    else if (stars.has(i)) out.push([...stars.get(i)!, word(TRACK)])
    else out.push([0x20, DEFAULT, word(TRACK)])
  }
  return pack(out)
}

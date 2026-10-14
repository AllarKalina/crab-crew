import { expect, test } from 'claude-code/testing'

import { DOTS, DRIFT, MARK, PAIRS, STAR_LOW, barCells, crabInTrack, fitRow, lanesAt, lanesOf, marksOf, pillOf, rasterAt, starsOf } from './term-bar'
import type { BarState } from './term-bar'
import { bar, decode } from './testkit'
import { BAND } from './theme'

test('crab: the Raster starts past it, on a plain cell, with no star or mark under it', () => {
  const n = 56 - pillOf(bar())
  expect(rasterAt(bar())).toBe(9)
  for (let t = 0; t < 400; t++) {
    const track = decode(barCells(bar(), t))
    expect(track.length).toBe(n - 9)
    // Cell 9, past its right claw, is plain track whatever drifts by.
    expect(track[0]?.slice(0, 2)).toEqual([0x20, 0x01000000])
    // The boundaries on cells 2 and 9 are under the crab and on its free cell; the
    // others are drawn where they fall.
    const marks = track.flatMap((c, i) => (c[0] === MARK ? [i + 9] : []))
    expect(marks).toEqual([16, 23, 30, 37])
    // A Raster draws BMP glyphs only.
    expect(track.every(c => c[0]! < 0x10000)).toBe(true)
  }
})

test('crab: leaves the track when it is short or the flow is done', () => {
  // A label of 9 holds a pill of 12. The pill's rounded head, the crab's 8 cells, its
  // free cell, two of starry track and the cap: 13 cells of track fit the crab, 12 do not.
  const short = { label: 'Tasks 0/8', ratio: 0, done: 0 }
  expect(crabInTrack(bar({ ...short, columns: 25 }))).toBe(true)
  expect(crabInTrack(bar({ ...short, columns: 24 }))).toBe(false)
  // In the track, the Raster is the free cell, two of track and the cap.
  expect(decode(barCells(bar({ ...short, columns: 25 }), 0)).length).toBe(4)
  // Out of the track, the Raster is the whole of it again, head and boundaries too.
  const track = decode(barCells(bar({ ...short, columns: 24 }), 0))
  expect(rasterAt(bar({ ...short, columns: 24 }))).toBe(0)
  expect(track.length).toBe(12)
  expect(track[0]?.[0]).toBe(0xe0b4)
  const done = bar({ isFinished: true, ratio: 1, label: 'Done' })
  expect(crabInTrack(done)).toBe(false)
  expect(decode(barCells(done, 0)).length).toBe(1)
})

test('colors: what the pill, the head and the crab share with the Raster sits on its 12-bit grid', () => {
  const onGrid = (hex: string) => [1, 3, 5].every(i => parseInt(hex.slice(i, i + 2), 16) % 0x11 === 0)
  expect([BAND.fill, BAND.done, BAND.track].filter(c => !onGrid(c))).toEqual([])
  // The marks' tints are the Raster's alone; on the grid, they show as written.
  expect([BAND.mark, BAND.markLit].filter(c => !onGrid(c))).toEqual([])
  const word = (hex: string) => parseInt(hex.slice(1), 16)
  // The track is painted in the very color the crab's Text sits on.
  expect(decode(barCells(bar(), 0))[0]?.[2]).toBe(word(BAND.track))
  // A head in the Raster wears the pill's own color, green once done.
  expect(decode(barCells(bar({ label: 'Tasks 0/8', ratio: 0, done: 0, columns: 19 }), 0))[0]?.[1]).toBe(word(BAND.fill))
  expect(decode(barCells(bar({ isFinished: true, ratio: 1, label: 'Done' }), 0))[0]?.[1]).toBe(word(BAND.done))
})

const isStar = (cp: number) => cp >= 0x2800 && cp <= 0x28ff

// Stars to a cell where they can be: past the head, or the crab's free cell, short
// of the cap, marks and the clear cells beside them aside. The lowest and the mean
// over a full drift cycle, the time a star takes to cross the whole bar.
const density = (state: BarState) => {
  const ticks = Math.ceil(state.columns / DRIFT)
  let low = 1
  let sum = 0
  for (let t = 0; t < ticks; t++) {
    const all = decode(barCells(state, t))
    const cells = all.slice(1, -1).filter((_, i) => ![i, i + 1, i + 2].some(k => all[k]![0] === MARK))
    const k = cells.filter(c => isStar(c[0]!)).length / cells.length
    low = Math.min(low, k)
    sum += k
  }
  return { low, mean: sum / ticks }
}

test('stars: as many to an open cell on a short track behind the crab as on a long one', () => {
  // One task: no boundary ahead. A pill of 12, then tracks of 19, 44 and 68 cells
  // with the crab in them (8, 33 and 57 open cells), and of 9 without it (7).
  const lone = { label: 'Tasks 0/1', ratio: 0, done: 0, total: 1 }
  const short = density(bar({ ...lone, columns: 31 }))
  for (const columns of [56, 80, 21]) {
    const long = density(bar({ ...lone, columns }))
    // One star to about 2.6 cells: none is lost behind the crab.
    expect(Math.abs(short.mean - long.mean)).toBeLessThan(0.08)
    // At every tick, as many as the stretch holds lanes, whole: 7 cells hold two.
    expect(long.low).toBeGreaterThan(columns === 21 ? 0.28 : 0.33)
  }
  expect(short.low).toBeGreaterThan(0.33)
  // And so with boundaries ahead: marks are not counted as room for stars.
  expect(density(bar({ columns: 80 })).low).toBeGreaterThan(0.33)
})

test('stars: each drifts forward in its own lane, never back, two cells apart or more', () => {
  // Broken rules, as `columns@tick: what`, checked once at the end: an expect a
  // star a tick is most of the time a test takes.
  const broken: string[] = []
  for (const columns of [21, 31, 56, 80]) {
    const state = bar({ columns })
    const n = columns - pillOf(state)
    // The open stretch: past the head or the crab's free cell, short of the cap.
    const [lo, hi] = [rasterAt(state) + 1, n - 2]
    const marks = marksOf(state, pillOf(state))
    const from = rasterAt(state)
    // Open cells counted from the stretch's start, for any ten of them at once.
    const open = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter(i => !marks.has(i))
    let last = starsOf(state, 0)
    let [enters, leaves] = [0, 0]
    // A full cycle: every star crosses the whole bar.
    for (let t = 1; t <= Math.ceil(columns / DRIFT) + 1; t++) {
      const at = starsOf(state, t)
      for (const [j, x] of at) {
        if (x < lo || x > hi) broken.push(`${columns}@${t}: star at ${x}`)
        const was = last.get(j)
        // A cell forward at most; a star comes into view at the stretch's start only.
        if (was === undefined) {
          if (x !== lo) broken.push(`${columns}@${t}: enters at ${x}`)
          enters++
        } else if (x - was !== 0 && x - was !== 1) broken.push(`${columns}@${t}: moves ${x - was}`)
      }
      // And leaves it at its end only, to come round under the pill.
      for (const [j, was] of last)
        if (!at.has(j)) {
          if (was !== hi) broken.push(`${columns}@${t}: leaves at ${was}`)
          leaves++
        }
      // Evenly: neighbours two or three cells apart, never closer, so none huddle.
      const xs = [...at.values()].sort((a, b) => a - b)
      for (let i = 1; i < xs.length; i++) if (xs[i]! - xs[i - 1]! < 2 || xs[i]! - xs[i - 1]! > 3) broken.push(`${columns}@${t}: gap ${xs[i]! - xs[i - 1]!}`)
      // Drawn where they are but over a milestone or beside one.
      const cells = decode(barCells(state, t))
      const drawn = cells.flatMap((c, i) => (isStar(c[0]!) ? [i + from] : []))
      const shown = new Set(cells.flatMap((c, i) => (c[0] === MARK ? [i + from] : [])))
      const expected = xs.filter(x => ![x - 1, x, x + 1].some(k => shown.has(k)))
      if (drawn.join() !== expected.join()) broken.push(`${columns}@${t}: drawn ${drawn} for ${expected}`)
      // No ten open cells hold more than five stars: a running count over the open cells.
      const lit = new Set(drawn)
      const sum = [0]
      for (const x of open) sum.push(sum.at(-1)! + (lit.has(x) ? 1 : 0))
      for (let i = 0; i + 10 < sum.length; i++) if (sum[i + 10]! - sum[i]! > 5) broken.push(`${columns}@${t}: ${sum[i + 10]! - sum[i]!} stars in ten cells`)
      last = at
    }
    // They do come round, all of them.
    if (enters < lanesOf(columns) || leaves < lanesOf(columns)) broken.push(`${columns}: ${enters} in, ${leaves} out of ${lanesOf(columns)} lanes`)
  }
  expect(broken.slice(0, 5)).toEqual([])
})

test('stars: a step forward hides those the pill or the crab now covers, and the rest stay put', () => {
  // 56 columns: the pill grows from 20 cells to 21, and from 43 to 44, where the crab
  // leaves the track and the head takes its place.
  for (const [a, b] of [[21, 22], [44, 45]] as const) {
    const before = bar({ ratio: a / 56, total: 1, done: 0, label: 'Tasks 0/1' })
    const after = bar({ ratio: b / 56, total: 1, done: 0, label: 'Tasks 0/1' })
    expect(pillOf(after) - pillOf(before)).toBe(1)
    let kept = 0
    for (let t = 0; t <= Math.ceil(56 / DRIFT); t += 7) {
      const [was, now] = [starsOf(before, t), starsOf(after, t)]
      // In the bar's own columns: the star of each lane where it was.
      for (const [j, x] of now)
        if (was.has(j)) {
          expect(x + pillOf(after)).toBe(was.get(j)! + pillOf(before))
          kept++
        }
      // Only stars at the stretch's new start are hidden.
      const edge = pillOf(after) + rasterAt(after) + 1
      for (const [j, x] of was) if (x + pillOf(before) >= edge) expect(now.has(j)).toBe(true)
    }
    expect(kept).toBeGreaterThan(0)
  }
  expect([crabInTrack(bar({ ratio: 44 / 56 })), crabInTrack(bar({ ratio: 45 / 56 }))]).toEqual([true, false])
})

test('stars: bright enough to read, a quarter of them two dots wide, none by the crab', () => {
  const [track = 0, star = 0, glint = 0] = [BAND.track, BAND.star, BAND.fill].map(c => parseInt(c.slice(1), 16))
  const channel = (w: number, k: number) => (w >> k) & 255
  // Of the way from the track to the star's tone, channel by channel.
  const level = (fg: number, tone: number) =>
    Math.min(...[16, 8, 0].map(k => (channel(fg, k) - channel(track, k)) / (channel(tone, k) - channel(track, k))))
  let pairs = 0
  let all = 0
  let low = 1
  for (let t = 0; t < 400; t++) {
    const cells = decode(barCells(bar(), t))
    // The free cell past the crab's claw stays plain, a pair of dots or not.
    expect(cells[0]?.[0]).toBe(0x20)
    for (const [cp, fg] of cells.slice(1, -1)) {
      if (cp === MARK || cp === 0x20) continue
      all++
      if (PAIRS.includes(cp!)) pairs++
      // The first of its tones it can be: a glint and a star share their red.
      const k = Math.max(level(fg!, star), level(fg!, glint))
      low = Math.min(low, k)
      expect(k).toBeLessThanOrEqual(1)
    }
  }
  expect(low).toBeGreaterThanOrEqual(STAR_LOW - 0.02)
  expect(low).toBeLessThan(STAR_LOW + 0.1)
  expect(pairs / all).toBeGreaterThan(0.12)
  expect(pairs / all).toBeLessThan(0.4)
  // Two dots side by side, in the BMP.
  expect(PAIRS.every(p => p < 0x10000 && isStar(p))).toBe(true)
})

// Braille dots 1 and 4 are the cell's top row, 7 and 8 its bottom: the track's edge pixel rows.
const EDGE_ROWS = 0x01 | 0x08 | 0x40 | 0x80

test('stars: on the two middle dot rows only, left or right, single or paired', () => {
  expect([...DOTS, ...PAIRS].every(cp => isStar(cp) && ((cp - 0x2800) & EDGE_ROWS) === 0)).toBe(true)
  // A pair is two dots side by side, on one middle row: dots 2 and 5, or 3 and 6.
  expect(PAIRS.map(cp => (cp - 0x2800).toString(2).padStart(8, '0'))).toEqual(['00010010', '00100100'])
  const seen = new Set<number>()
  for (const columns of [40, 56, 72]) {
    for (let t = 0; t < 400; t++) {
      for (const [cp] of decode(barCells(bar({ columns }), t))) {
        if (!isStar(cp!)) continue
        expect(((cp! - 0x2800) & EDGE_ROWS).toString(16)).toBe('0')
        seen.add(cp!)
      }
    }
  }
  // Every glyph turns up: the variety is left or right, upper or lower, one dot or two.
  expect([...seen].sort()).toEqual([...DOTS, ...PAIRS].sort())
})

test('marks: a boundary ahead is a still bar in its own tint, never by the crab, lit as a star passes behind', () => {
  // U+2502 BOX DRAWINGS LIGHT VERTICAL: the height of the cell, in the BMP, no star's dots.
  expect(MARK).toBe(0x2502)
  const tint = parseInt(BAND.mark.slice(1), 16)
  const lit = parseInt(BAND.markLit.slice(1), 16)
  const track = parseInt(BAND.track.slice(1), 16)
  // Distinct from the track, the pill and the stars' own tones.
  expect([BAND.track, BAND.fill, BAND.star, BAND.done].map(c => parseInt(c.slice(1), 16))).not.toContain(tint)
  // Lit, it wears the stars' own tone, brighter than its tint channel by channel.
  expect(BAND.markLit).toBe(BAND.star)
  const channels = (w: number) => [16, 8, 0].map(k => (w >> k) & 255)
  channels(lit).forEach((c, k) => expect(c).toBeGreaterThan(channels(tint)[k]!))
  const cases: [Partial<BarState>, number[], number[]][] = [
    // 56 columns, 1 of 8 done: boundaries on cells 2 (under the crab), 9 (its free
    // cell), 16, 23, 30, 37.
    [{}, [2, 9, 16, 23, 30, 37], [16, 23, 30, 37]],
    // 54 columns, 1 of 6 done: boundaries on cells 6 (under the crab), 15, 24, 33.
    [{ columns: 54, total: 6, done: 1, ratio: 1 / 6, label: 'Tasks 1/6' }, [6, 15, 24, 33], [15, 24, 33]],
    // Without the crab, a boundary is drawn wherever it falls past the head: cell 2.
    [{ columns: 21, total: 3, done: 0, ratio: 0, label: 'Tasks 0/3' }, [2], [2]],
  ]
  for (const [over, ahead, drawn] of cases) {
    const state = bar(over)
    const from = rasterAt(state)
    // Every boundary ahead is computed, those under the crab or its free cell too.
    expect([...marksOf(state, pillOf(state))].sort((a, b) => a - b)).toEqual(ahead)
    let passes = 0
    for (let t = 0; t < Math.ceil(state.columns / DRIFT); t++) {
      const cells = decode(barCells(state, t))
      const marks = cells.flatMap((c, i) => (c[0] === MARK ? [i + from] : []))
      // The same cells at every tick, whatever drifts by: no star takes a mark's cell.
      expect(marks).toEqual(drawn)
      // A star over it is not drawn: the mark is lit for that cell instead, and only then.
      const behind = new Set(starsOf(state, t).values())
      for (const i of marks) expect(cells[i - from]?.slice(1)).toEqual([behind.has(i) ? lit : tint, track])
      passes += marks.filter(i => behind.has(i)).length
      // Never the crab's free cell.
      if (from) expect(cells[0]?.[0]).toBe(0x20)
    }
    // Every star passes behind each mark in a cycle, for 25 ticks a time.
    expect(passes).toBe(drawn.length * lanesOf(state.columns) * 25)
  }
})

// The track cells of the milestones a Raster draws.
const shownOf = (cells: number[][], from: number) => new Set(cells.flatMap((c, i) => (c[0] === MARK ? [i + from] : [])))

test('marks: clear space round each milestone: a star beside one is not drawn, nor moved, and one on it lights it', () => {
  const state = bar()
  const from = rasterAt(state)
  const lit = parseInt(BAND.markLit.slice(1), 16)
  let [skipped, shown] = [0, 0]
  for (let t = 0; t < Math.ceil(state.columns / DRIFT); t++) {
    const cells = decode(barCells(state, t))
    const marks = shownOf(cells, from)
    shown = marks.size
    for (const x of starsOf(state, t).values()) {
      const [cp, fg] = cells[x - from]!
      if (marks.has(x)) expect([cp, fg]).toEqual([MARK, lit])
      else if (marks.has(x - 1) || marks.has(x + 1)) {
        expect(cp).toBe(0x20)
        skipped++
      } else expect(isStar(cp!)).toBe(true)
    }
  }
  // Every star skips both cells beside each milestone, 25 ticks each, in a cycle.
  expect(shown).toBe(4)
  expect(skipped).toBe(shown * 2 * lanesOf(state.columns) * 25)
})

test('stars: over every bar of 14 to 56 columns, every pill and a full drift cycle, they keep their lanes and clear of the marks', () => {
  // Broken rules, as `columns/pill@tick: what`: none, so the test stays quick.
  const broken: string[] = []
  for (let columns = 14; columns <= 56; columns++) {
    const ticks = Math.ceil(columns / DRIFT) + 1
    // Every lane, seen or not: two cells apart or more, across the wrap too.
    for (let t = 0; t < ticks; t++) {
      const xs = lanesAt(columns, t).sort((a, b) => a - b)
      const gaps = xs.map((x, i) => (i ? x - xs[i - 1]! : x + columns - xs.at(-1)!))
      if (xs.length > 1 && Math.min(...gaps) < 2) broken.push(`${columns}@${t}: gap ${Math.min(...gaps)}`)
    }
    // The ticks some lane moves on: between them every pill's stars stand still.
    const moves = Array.from({ length: ticks }, (_, t) => t > 0 && lanesAt(columns, t).join() !== lanesAt(columns, t - 1).join())
    // A pill of the label and its ends up to the whole bar but the cap.
    for (let pill = 7; pill < columns; pill++) {
      const state = bar({ columns, ratio: (pill + 1) / columns, label: 'Plan', total: 8, done: 0 })
      if (pillOf(state) !== pill) broken.push(`${columns}/${pill}: a pill of ${pillOf(state)}`)
      const [from, hi] = [rasterAt(state), columns - pill - 2]
      let last = starsOf(state, 0)
      for (let t = 1; t < ticks; t++) {
        // A star holds a cell for 25 ticks: every 24th sees each star in each.
        const isSampled = t % 24 === 0
        if (!moves[t] && !isSampled) continue
        const at = starsOf(state, t)
        // Into view at the stretch's start only, out of it at its end only.
        for (const [j, x] of at) if (!last.has(j) && x !== from + 1) broken.push(`${columns}/${pill}@${t}: enters at ${x}`)
        for (const [j, x] of last) if (!at.has(j) && x !== hi) broken.push(`${columns}/${pill}@${t}: leaves at ${x}`)
        last = at
        if (!isSampled) continue
        const cells = decode(barCells(state, t))
        const marks = shownOf(cells, from)
        cells.forEach(([cp], i) => {
          if (isStar(cp!) && (marks.has(i + from - 1) || marks.has(i + from + 1))) broken.push(`${columns}/${pill}@${t}: star at ${i + from} by a mark`)
        })
      }
    }
  }
  expect(broken.slice(0, 5)).toEqual([])
})

test('row: the band fits its row, and the title gives way before the label', () => {
  for (const cols of [40, 60, 80, 100, 200]) {
    for (const [label, percent] of [['Review 12/24', '50%'], ['Done', '100%']] as const) {
      const { gap, titleW, barW } = fitRow(cols, 'A title long enough to have to give way', label, percent, '×12')
      const lead = titleW ? 2 + titleW : 1
      // The crab at rest beside the percentage, 6 cells, is the widest the rest can be.
      const rest = 4 * gap + percent.length + 1 + 6 + 3 + 1
      expect(lead + barW + rest).toBeLessThanOrEqual(cols - 4)
      expect(barW).toBeGreaterThanOrEqual(label.length + 5)
      expect(barW).toBeLessThanOrEqual(56)
    }
  }
})

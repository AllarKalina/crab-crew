import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { cells } from './format'
import { colorOf } from './roles'
import { CAPS } from './glyphs'
import { MARK_W } from './term-bar'
import { CRAB, CRAB_FRAMES, CRAB_REST, LAP, tintOf } from './term-crab'
import { BAND, contrast } from './theme'
import { bandText, boot, complete, crew, engine, mountBand, report, spawn, startSession, svgOf, turnStart } from './testkit'

// The band's crab, drawn as one Text: any of its frames in the track, at rest beside
// the percentage.
const CRABS = new RegExp(`^(${[...Object.values(CRAB_FRAMES), CRAB_REST].join('|')})$`, 'u')

// The crab as drawn: in the track, a Text after the pill's rounded head, which has
// its own; beside the percentage, one Text.
type Found = { text: string; children?: unknown[] }
type Finder = { find(q: { type?: string; key?: string; text?: RegExp }): Promise<Found | undefined> }
const glyphs = (n: unknown): string => (typeof n === 'string' ? n : ((n as Drawn).children ?? []).map(glyphs).join(''))
const crabOf = async (ui: Finder): Promise<string> => {
  const walking = await ui.find({ key: 'crew-crab' })
  if (walking) return [...glyphs(walking)].slice(1).join('')
  return (await ui.find({ type: 'Text', text: CRABS }))?.text ?? ''
}

// The cells a drawn element takes, laid out as the engine lays out the band: a row
// Box adds up its children and gaps, a column stacks them, and every glyph the band
// draws is one cell, or two for CJK and emoji. A Box of fixed width whose content is
// wider wraps a row.
type Drawn = { type: string; props?: Record<string, unknown>; children?: unknown[] }
const sizeOf = (n: unknown): { w: number; h: number } => {
  if (typeof n === 'string') return { w: cells(n), h: 1 }
  const { type, props: p = {}, children = [] } = n as Drawn
  if (type === 'Text') return { w: cells(glyphs(n)), h: 1 }
  if (type === 'Button') return { w: cells(String(p.label)), h: 1 }
  if (type === 'Raster') return { w: Number(p.columns), h: Number(p.rows) }
  const kids = children.filter(k => k != null && k !== false).map(sizeOf)
  const gap = Number(p.gap ?? 0)
  if (p.flexDirection === 'column') return { w: Math.max(0, ...kids.map(k => k.w)), h: kids.reduce((s, k) => s + k.h, 0) }
  const w = kids.reduce((s, k) => s + k.w, 0) + gap * Math.max(0, kids.length - 1)
  const h = Math.max(1, ...kids.map(k => k.h))
  return typeof p.width === 'number' ? { w: p.width, h: w > p.width ? h + 1 : h } : { w, h }
}

// The band's own row at a width: its size, and whether the crab walks in the track.
const bandRow = async ($: Engine, bodyColumns: number) => {
  const ui = await mountBand($, 'terminal', bodyColumns)
  const row = await ui.find({ key: 'crew-row' })
  const crab = await ui.find({ key: 'crew-crab' })
  await ui.unmount()
  return { ...sizeOf(row), crab: crab ? sizeOf(crab) : undefined }
}

test('terminal: the band draws its bar as one Raster', async ($, on) => {
  engine(on)
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  const ui = await mountBand($)
  const bars = await ui.findAll({ type: 'Raster' })
  expect(bars.length).toBe(1)
  expect(bars[0]?.props.rows).toBe(1)
  // The label sits in the pill; the crab walks at the head of the track, past the
  // pill's rounded head, all in the scout's colour on the track.
  expect((await ui.find({ type: 'Text', text: /^Tasks 0\/1$/ }))?.props.backgroundColor).toBeDefined()
  const crab = (await ui.find({ key: 'crew-crab' })) as Drawn | undefined
  const [head, body] = (crab?.children ?? []) as Drawn[]
  // The pill keeps its rounded head, in its colour on the track: nothing of the crab
  // is drawn on the pill.
  expect(glyphs(head)).toBe(String.fromCodePoint(CAPS.nerd[1]))
  expect(head?.props).toMatchObject({ color: BAND.fill, backgroundColor: BAND.track })
  expect(body?.props).toMatchObject({ color: '#a6e3a1', backgroundColor: BAND.track })
  expect(Object.values(CRAB_FRAMES)).toContain(glyphs(body))
})

test('terminal: with no agent yet, the walking crab is the plain grey crab, lifted clear of the track', async ($, on) => {
  engine(on)
  await report($, { title: 'Login fix', phase: 'delegate', total: 3, done: 1 })
  const ui = await mountBand($)
  const crab = (await ui.find({ key: 'crew-crab' })) as Drawn | undefined
  const [head, body] = (crab?.children ?? []) as Drawn[]
  expect(head?.props).toMatchObject({ color: BAND.fill, backgroundColor: BAND.track })
  expect(body?.props).toMatchObject({ color: tintOf('other'), backgroundColor: BAND.track })
  expect(contrast(tintOf('other'), BAND.track)).toBeGreaterThan(contrast(colorOf('other'), BAND.track))
})

test('terminal: beside the percentage, with no agent, the crab is the plain grey one, at 40 columns and once done', async ($, on) => {
  engine(on)
  const beside = async (bodyColumns: number) => {
    const ui = await mountBand($, 'terminal', bodyColumns)
    const walking = await ui.find({ key: 'crew-crab' })
    const crabs = await ui.findAll({ type: 'Text', text: CRABS })
    await ui.unmount()
    return { walking: !!walking, crabs: crabs.map(c => [c.text, c.props.color, c.props.backgroundColor]) }
  }
  await report($, { title: 'Login fix', phase: 'delegate', total: 3, done: 1 })
  // Too narrow for the track: at rest beside the percentage, in grey, on the band's own background.
  expect(await beside(40)).toEqual({ walking: false, crabs: [[CRAB_REST, colorOf('other'), undefined]] })
  await report($, { finished: true })
  expect(await bandText($, /^Done$/)).toBe(1)
  expect(await beside(100)).toEqual({ walking: false, crabs: [[CRAB_REST, colorOf('other'), undefined]] })
})

test('band: ✕ puts the bar away and /crew bar brings it back, counts intact', async ($, on) => {
  engine(on)
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  const ui = await mountBand($)
  await ui.press({ key: 'crew-dismiss' })
  await ui.unmount()
  // Put away, the band draws nothing of its own and passes the render on.
  const hidden = await bandText($, /^Tasks 0\/1$/).catch(() => 0)
  expect(hidden).toBe(0)
  expect((await crew($, 'bar'))?.text).toBe('Progress bar shown.')
  expect(await bandText($, /^Tasks 0\/1$/)).toBe(1)
})

// One crab in the band: walking at the head of the track, before the percentage,
// or beside it after.
const bandCrab = async ($: Engine, bodyColumns: number) => {
  const ui = await mountBand($, 'terminal', bodyColumns)
  const walking = await ui.find({ key: 'crew-crab' })
  // Beside the percentage it sits on the band's own background; in the track, on the track.
  const beside = (await ui.findAll({ type: 'Text', text: CRABS })).filter(c => c.props.backgroundColor !== BAND.track)
  await ui.unmount()
  if (walking && beside.length === 0) return CRABS.test([...glyphs(walking)].slice(1).join('')) ? 'track' : 'no crab'
  if (walking || beside.length !== 1) return `${beside.length + (walking ? 1 : 0)} crabs`
  return beside[0]?.text === CRAB_REST ? 'beside' : 'walking beside'
}

test('band: exactly one crab, in the track or beside the percentage', async ($, on) => {
  engine(on)
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  expect(await bandCrab($, 100)).toBe('track')
  // A narrow window leaves the track no room for it.
  expect(await bandCrab($, 40)).toBe('beside')
  await complete($, 'a1')
  await complete($)
  expect(await bandText($, /^Done$/)).toBe(1)
  expect(await bandCrab($, 100)).toBe('beside')
})

// A session under way: the band's timer runs, and each blit is kept.
const started = async ($: Engine, on: On, blits: unknown[]) => {
  const clock = engine(on)
  boot(on, { blits })
  await startSession($)
  return clock
}

// The crab's frame after each of `ticks` timer ticks.
const walk = async (clock: { advance(ms: number): Promise<void> }, ui: Finder, ticks: number, each?: () => void) => {
  const frames: string[] = []
  for (let i = 0; i < ticks; i++) {
    await clock.advance(150)
    frames.push(await crabOf(ui))
    each?.()
  }
  return frames
}
const repeats = (frames: string[]) => frames.filter((f, i) => i > 0 && f === frames[i - 1]).length

test('band: the crab walks between draws, and a finished bar stays quiet', async ($, on) => {
  const blits: unknown[] = []
  const clock = await started($, on, blits)
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  const ui = await mountBand($, 'terminal', undefined, 'band')
  const frames = await walk(clock, ui, 8)
  expect([...new Set(frames)].sort()).toEqual(Object.values(CRAB_FRAMES).sort())
  // A frame holds for 2 ticks: 8 ticks repeat one 3 or 4 times, as the cycle falls.
  expect(repeats(frames)).toBeGreaterThanOrEqual(3)
  expect(blits.length).toBeGreaterThan(0)

  await complete($, 'a1')
  await complete($)
  blits.length = 0
  expect(await walk(clock, ui, 10)).toEqual(Array(10).fill(CRAB_REST))
  expect(blits.length).toBe(0)
})

test('band: a step forward makes the crab scuttle', async ($, on) => {
  const clock = await started($, on, [])
  for (const id of ['a1', 'a2', 'a3']) await spawn($, { id, type: 'Explore', description: `Find ${id}` })
  const ui = await mountBand($, 'terminal', undefined, 'band')
  expect(repeats(await walk(clock, ui, 4))).toBeGreaterThan(0)
  await complete($, 'a1')
  expect(repeats(await walk(clock, ui, 6))).toBe(0)
  // It settles back to its own pace.
  expect(repeats(await walk(clock, ui, 8))).toBeGreaterThan(0)
})

test('band: the crab pauses at rest now and then, and writes nothing while it does', async ($, on) => {
  let draws = 0
  on('ui.render', { component: 'AbovePrompt' }, () => {
    draws++
    return { type: 'engine' } as never
  })
  const clock = await started($, on, [])
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  const ui = await mountBand($, 'terminal', undefined, 'band')
  const counts: number[] = []
  const frames = await walk(clock, ui, 2 * LAP, () => counts.push(draws))
  // Once a lap, A holds for the pause's 4 ticks, then for the next lap's own first
  // 2: one draw into A, none while it holds, one out of it.
  const held = frames.map((_, i) => frames.slice(i, i + 6).every(g => g === CRAB) && frames[i - 1] !== CRAB)
  const at = held.indexOf(true)
  expect(at).toBeGreaterThan(0)
  expect(frames.slice(at, at + 7).filter(f => f === CRAB).length).toBe(6)
  expect(counts[at]!).toBeGreaterThan(counts[at - 1]!)
  expect(counts[at + 5]).toBe(counts[at])
  expect(counts[at + 6]!).toBeGreaterThan(counts[at + 5]!)
  // Each step of the walk is a draw: 12 a lap, so the hold is not a band that never draws.
  expect(counts.at(-1)! - counts[0]!).toBeGreaterThanOrEqual(2 * 12 - 2)
  // Elsewhere no frame holds longer than its 2 ticks.
  const runs = frames.slice(0, -2).map((f, i) => frames.slice(i, i + 3).every(g => g === f))
  expect(runs.filter(Boolean).length).toBeLessThanOrEqual(2 * 4)
})

test('band: the row is one line, clear of the collapse mark, at 40, 80 and 100 columns', async ($, on) => {
  engine(on)
  await turnStart($, 'Fix the flaky login test across every browser we ship')
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  await spawn($, { id: 'a2', type: 'Plan', description: 'Plan the fix' })
  await complete($, 'a1')
  const check = async (walking: number[]) => {
    for (const cols of [40, 80, 100]) {
      const row = await bandRow($, cols)
      expect(`${cols}: ${row.h} row, ${row.w <= cols - MARK_W ? 'fits' : `${row.w} cells`}`).toBe(`${cols}: 1 row, fits`)
      // The crab's box: the pill's rounded head and the crab's eight cells, on the row.
      if (walking.includes(cols)) expect(row.crab).toEqual({ w: 9, h: 1 })
      else expect(row.crab).toBeUndefined()
    }
  }
  await check([80, 100])
  await complete($, 'a2')
  await complete($)
  expect(await bandText($, /^Done$/)).toBe(1)
  await check([])
})

test('band: a new flow under the same title does not inherit the last one\'s scuttle', async ($, on) => {
  const clock = await started($, on, [])
  await report($, { title: 'Login fix', phase: 'delegate', total: 2, done: 0 })
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  const ui = await mountBand($, 'terminal', undefined, 'band')
  // Each report is drawn before the next: a step forward, the end, a new flow.
  for (const input of [{ done: 1 }, { finished: true }, { title: 'Login fix', phase: 'delegate', total: 2, done: 0 }]) {
    await report($, input)
    await ui.drawn()
  }
  expect(await ui.find({ type: 'Text', text: /^Tasks 0\/2$/ })).toBeDefined()
  expect(repeats(await walk(clock, ui, 6))).toBeGreaterThan(0)
})

test('band: no crab frame is written, and nothing redrawn, while the flow waits or is done', async ($, on) => {
  const blits: unknown[] = []
  // Beneath the mod: each of its draws passes the render on, so this counts them.
  let draws = 0
  on('ui.render', { component: 'AbovePrompt' }, () => {
    draws++
    return { type: 'engine' } as never
  })
  const clock = await started($, on, blits)
  await turnStart($, 'Fix the flaky login test')
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  const ui = await mountBand($, 'terminal', undefined, 'band')
  await walk(clock, ui, 4)
  expect(draws).toBeGreaterThan(1)

  // The agent ended and the main loop works on: the flow waits, its one task done, the
  // pill all but full, and the crab rests beside the percentage.
  await complete($, 'a1')
  await ui.drawn()
  let before = draws
  expect(await walk(clock, ui, 10)).toEqual(Array(10).fill(CRAB_REST))
  expect(draws).toBe(before)
  // The stars still drift while it waits.
  expect(blits.length).toBeGreaterThan(0)

  await complete($)
  expect(await bandText($, /^Done$/)).toBe(1)
  await ui.drawn()
  before = draws
  blits.length = 0
  await walk(clock, ui, 10)
  expect(draws).toBe(before)
  expect(blits.length).toBe(0)
})

test('band: a title of wide characters fits the row by its cells', async ($, on) => {
  engine(on)
  for (const title of ['修复所有浏览器上不稳定的登录测试问题并且重新运行', '🦀🦀 Fix the crab 🦀 race in every browser we ship 🦀🦀']) {
    await turnStart($, title)
    await spawn($, { id: title, type: 'Explore', description: 'Find the login tests' })
    for (const cols of [40, 60, 80, 100]) {
      const row = await bandRow($, cols)
      expect(`${cols}: ${row.h} row, ${row.w <= cols - MARK_W ? 'fits' : `${row.w} cells`}`).toBe(`${cols}: 1 row, fits`)
    }
    await complete($, title)
    await complete($)
  }
})

test('desktop: the band wears the terminal\'s pill colours, its label in the same dark ink', async ($, on) => {
  engine(on)
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  const row = await svgOf(await mountBand($, 'desktop'))
  expect(row).toContain(`fill="${BAND.fill}"`)
  expect(row).toContain(`fill="${BAND.ink}"`)
  await complete($, 'a1')
  await complete($)
  expect(await svgOf(await mountBand($, 'desktop'))).toContain(`fill="${BAND.done}"`)
})

test('terminal: title, bar and label render as plain Text nodes with no Svg', async $ => {
  await report($, { title: 'Ship it', total: 4, done: 1, phase: 'delegate' })
  const ui = await mountBand($)
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(0)
  expect((await ui.findAll({ type: 'Text', text: /^Ship it$/ })).length).toBe(1)
  expect((await ui.findAll({ type: 'Text', text: /^Tasks 1\/4$/ })).length).toBe(1)
})

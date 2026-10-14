import { expect, test } from 'claude-code/testing'

import { CAPS, glyphsOf } from './glyphs'
import { CRAB_CELLS, REST_CELLS } from './term-bar'
import { CRABS, PLAIN_FRAMES, PLAIN_REST, crabFrame } from './term-crab'
import { bar, complete, decode, engine, mountBand, mountPane, report, spawn, step } from './testkit'

// The `glyphs` option: `nerd` (the default) for a Nerd Font and the octant crab, `plain`
// for a font with neither.

test('glyphs: anything but plain is the Nerd Font set', () => {
  expect([glyphsOf({}), glyphsOf({ glyphs: 'nerd' }), glyphsOf({ glyphs: 'plain' }), glyphsOf({ glyphs: 'odd' })]).toEqual(['nerd', 'nerd', 'plain', 'nerd'])
})

// Every code point a drawing shows: its texts and labels, and its Rasters' cells.
type Drawing = { findAll(q: object): Promise<{ type: string; text: string; props: Record<string, unknown> }[]> }
const codePointsOf = async (ui: Drawing): Promise<number[]> => {
  const all = await ui.findAll({})
  const texts = all.flatMap(el => [...el.text].map(c => c.codePointAt(0)!))
  const cells = all.filter(el => el.type === 'Raster').flatMap(el => decode(String(el.props.cells)).map(c => c[0]!))
  return [...texts, ...cells]
}
const isPua = (cp: number) => (cp >= 0xe000 && cp <= 0xf8ff) || cp >= 0xf0000
const strays = (cps: number[]) => [...new Set(cps.filter(cp => cp > 0xffff || isPua(cp)))].map(cp => cp.toString(16))

test('glyphs: plain draws no code point past the BMP and none from a private use area, in the band or the pane', { options: { glyphs: 'plain' } }, async ($, on) => {
  engine(on)
  await report($, { title: 'Ship it', phase: 'delegate', tasks: [{ title: 'Build the lexer', role: 'builder' }, { title: 'Polish it', role: 'designer' }] })
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  await spawn($, { id: 'a2', type: 'general-purpose', description: 'Wire the fix' })
  await step($, 'a2', { done: 1, total: 3, note: 'reading' })
  await complete($, 'a1')
  const seen: number[] = []
  // The crab walking in the track at 100 columns, at rest beside the percentage at 40.
  for (const cols of [100, 40]) {
    const ui = await mountBand($, 'terminal', cols)
    seen.push(...(await codePointsOf(ui)))
    await ui.unmount()
  }
  const pane = await mountPane($)
  seen.push(...(await codePointsOf(pane)))
  await pane.press({ key: 'done' })
  seen.push(...(await codePointsOf(pane)))
  await pane.press({ key: 'compact' })
  seen.push(...(await codePointsOf(pane)))
  // And once done.
  await complete($, 'a2')
  await report($, { finished: true })
  const done = await mountBand($)
  seen.push(...(await codePointsOf(done)))
  expect(strays(seen)).toEqual([])
  // The drawings were read whole: the band twice, the pane three ways, the band done.
  expect(seen.length).toBeGreaterThan(200)
})

test('glyphs: nerd draws its octant crab and powerline ends, which the plain check would catch', async ($, on) => {
  engine(on)
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  const ui = await mountBand($)
  const found = strays(await codePointsOf(ui))
  expect(found).toContain(CAPS.nerd[0].toString(16))
  expect(found.some(cp => parseInt(cp, 16) >= 0x1cd00 && parseInt(cp, 16) <= 0x1cdff)).toBe(true)
})

test('glyphs: the plain crab is ASCII, eight cells in the track and six at rest, and scuttles a cell either way', () => {
  expect(CRABS.plain.rest).toBe(PLAIN_REST)
  expect(Object.values(PLAIN_FRAMES).map(f => [...f].length)).toEqual([CRAB_CELLS, CRAB_CELLS, CRAB_CELLS])
  expect([...PLAIN_REST].length).toBe(REST_CELLS)
  expect([...Object.values(PLAIN_FRAMES), PLAIN_REST].every(f => /^[\x20-\x7e]+$/.test(f))).toBe(true)
  // The same crab in every frame, shifted.
  expect(Object.values(PLAIN_FRAMES).map(f => f.trim())).toEqual([PLAIN_REST, PLAIN_REST, PLAIN_REST])
  const { A, R, L } = PLAIN_FRAMES
  const plain = bar({ glyphs: 'plain' })
  expect(Array.from({ length: 8 }, (_, t) => crabFrame(plain, t))).toEqual([A, A, R, R, A, A, L, L])
  expect(crabFrame(bar({ glyphs: 'plain', isWalking: false }), 3)).toBe(A)
})

test('terminal: plain glyphs draw the bar\'s ends in half blocks and the crab in ASCII', { options: { glyphs: 'plain' } }, async ($, on) => {
  engine(on)
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  for (const bodyColumns of [100, 40]) {
    const ui = await mountBand($, 'terminal', bodyColumns)
    expect(await ui.find({ type: 'Text', text: new RegExp(`^${String.fromCodePoint(CAPS.plain[0])}$`, 'u') })).toBeDefined()
    const track = decode(String((await ui.find({ type: 'Raster' }))?.props.cells))
    expect(track.at(-1)?.[0]).toBe(CAPS.plain[1])
    // Without the crab in the track, the pill's head is the Raster's first cell, and
    // the crab rests beside the percentage.
    if (bodyColumns === 40) {
      expect(track[0]?.[0]).toBe(CAPS.plain[1])
      expect(await ui.find({ type: 'Text', text: PLAIN_REST })).toBeDefined()
    } else {
      const crab = await ui.find({ key: 'crew-crab' })
      expect(Object.values(PLAIN_FRAMES)).toContain(crab?.text.slice(1))
    }
    expect(track.some(c => c[0] === CAPS.nerd[1])).toBe(false)
    await ui.unmount()
  }
})

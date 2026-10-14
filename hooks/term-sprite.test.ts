import { expect, test } from 'claude-code/testing'

import { ROLES, colorOf } from './roles'
import { CRAB_CSS, crab } from './svg-crab'
import { LEGS, SPRITES, crabCells } from './term-sprite'
import { CLAY, M } from './theme'

// The crabs themselves, apart from where they are drawn: the terminal's half-block
// sprites (term-sprite.ts), which the desktop (svg-crab.ts) draws as SVG too.

test('sprites: every role has one of 7 rows by 14 pixels, every ink it uses mapped', () => {
  const shared = new Set(['.', 'C', 'k', 't'])
  for (const role of ROLES) {
    const { rows, ink } = SPRITES[role]
    expect(`${role}: ${rows.length} rows`).toBe(`${role}: 7 rows`)
    for (const row of [...rows, ...LEGS]) expect(`${role}: ${row.length}`).toBe(`${role}: 14`)
    const unmapped = [...new Set(rows.join(''))].filter(ch => !shared.has(ch) && !ink[ch])
    expect(`${role}: ${unmapped.join('')}`).toBe(`${role}: `)
  }
  // Each role's crab is its own drawing.
  expect(new Set(ROLES.map(role => crabCells(role))).size).toBe(ROLES.length)
})

// Every pixel a run of rects covers, as `x,y=colour`, sorted.
const pixelsOf = (svg: string): string[] =>
  [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="1" fill="([^"]+)"\/>/g)]
    .flatMap(([, x, y, w, fill]) => Array.from({ length: Number(w) }, (_, i) => `${Number(x) + i},${y}=${fill}`))
    .sort()
// The pixels a sprite's rows paint, the rows starting at `top`.
const spritePixels = (rows: string[], ink: Record<string, string>, top = 0): string[] =>
  rows.flatMap((row, y) => [...row].flatMap((ch, x) => (ink[ch] ? [`${x},${top + y}=${ink[ch]}`] : []))).sort()

test('desktop crab: every role is its terminal sprite, pixel for pixel, each leg row a frame', () => {
  for (const role of ROLES) {
    const { rows, ink } = SPRITES[role]
    const colours = { C: CLAY, k: M.crust, t: colorOf(role), ...ink }
    const svg = crab(0, 0, role)
    const legs = [...svg.matchAll(/<g class="legs-[ab]">(.*?)<\/g>/g)].map(m => m[1] ?? '')
    expect(`${role}: ${legs.length} leg frames`).toBe(`${role}: 2 leg frames`)
    const body = legs.reduce((rest, frame) => rest.replace(frame, ''), svg)
    expect({ role, pixels: pixelsOf(body) }).toEqual({ role, pixels: spritePixels(rows, colours) })
    legs.forEach((frame, i) => expect({ role, i, pixels: pixelsOf(frame) }).toEqual({ role, i, pixels: spritePixels([LEGS[i]!], colours, rows.length) }))
    expect(svg).toContain('shape-rendering="crispEdges"')
  }
  // The legs swap only while walking, and stand still for less motion.
  expect(crab(0, 0, 'builder', false, true)).toContain('class="c-builder run"')
  expect(crab(0, 0, 'builder')).not.toContain(' run')
  expect(CRAB_CSS).toMatch(/prefers-reduced-motion: reduce\)\{[^}]*animation:none/)
})

test('costumes: every role dresses its desktop crab in its own costume', () => {
  const drawn = ROLES.map(role => crab(0, 0, role))
  ROLES.forEach((role, i) => expect(drawn[i]).toContain(`class="c-${role}"`))
  expect(new Set(drawn.map(d => d.replace(/c-\w+/, ''))).size).toBe(ROLES.length)
})

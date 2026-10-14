import type { Role } from '../types'
import { tag } from './svg-tag'
import { LEGS, SPRITES, inkOf } from './term-sprite'

// The desktop's crab is the terminal's: each role's sprite (term-sprite.ts), 14 by 8
// pixels, every pixel a square of SVG and every run of one ink along a row one rect.
// The rows around it lay out a box 30 units wide and 28 tall at scale 1; the sprite
// sits in its middle at two units a pixel.
const BOX_W = 30
const BOX_H = 28
const UNIT = 2
const SPRITE_W = 14
const SPRITE_H = 8
const INSET_X = (BOX_W - SPRITE_W * UNIT) / 2
const INSET_Y = (BOX_H - SPRITE_H * UNIT) / 2

// The crabs in the crew pane; the band draws its own smaller.
export const CRAB_SCALE = 1.1

// One sprite row as rects, in sprite pixels: a run of one letter is one rect.
const rowRects = (row: string, y: number, ink: Record<string, string>): string => {
  let out = ''
  for (let start = 0; start < row.length; ) {
    const letter = row[start] ?? '.'
    let end = start + 1
    while (row[end] === letter) end++
    const fill = ink[letter]
    if (fill) out += tag('rect', { x: start, y, width: end - start, height: 1, fill })
    start = end
  }
  return out
}

// A walking crab alternates its two leg rows like the terminal sprite; resting crabs,
// and viewers who prefer reduced motion, keep the first. At 0.5s per pose, the row's
// 1s repaint always lands both legs back on the same beat.
export const CRAB_CSS = `<style>
.legs-b{opacity:0}
.run .legs-a{animation:legs-a .5s steps(1) infinite}
.run .legs-b{animation:legs-b .5s steps(1) infinite}
@keyframes legs-a{50%{opacity:0}}
@keyframes legs-b{50%{opacity:1}}
@media (prefers-reduced-motion: reduce){.run .legs-a,.run .legs-b{animation:none}}
</style>`

const drawn = new Map<Role, string>()

// The role's sprite and both leg rows, in sprite pixels; the same for every crab of the role.
const pixels = (role: Role): string => {
  const hit = drawn.get(role)
  if (hit !== undefined) return hit
  const ink = inkOf(role)
  const rows = SPRITES[role].rows
  const body = rows.map((row, y) => rowRects(row, y, ink)).join('')
  const legs = LEGS.map((row, i) => tag('g', { class: i === 0 ? 'legs-a' : 'legs-b' }, rowRects(row, rows.length, ink))).join('')
  drawn.set(role, body + legs)
  return body + legs
}

// A crab with its box's top left at (x, y), classed by its role and, walking, `run`.
// A dimmed one is a planned task's.
export const crab = (x: number, y: number, costume: Role, dim = false, isWalking = false, scale = CRAB_SCALE): string =>
  tag(
    'g',
    { transform: `translate(${x},${y}) scale(${scale})`, opacity: dim && 0.45 },
    tag('g', { class: isWalking ? `c-${costume} run` : `c-${costume}`, transform: `translate(${INSET_X},${INSET_Y}) scale(${UNIT})`, 'shape-rendering': 'crispEdges' }, pixels(costume)),
  )

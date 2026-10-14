import type { AgentRun, AgentStatus, Role } from '../types'
import type { Planned, Totals } from './flow'
import { fitText, fmtCost, fmtTime, fmtTokens, textWidth, xml } from './format'
import { colorOf, dimColorOf, roleOf } from './roles'
import { ctxOf, elapsed, metaOf, progressOf, stepsOf } from './runs'
import { CRAB_CSS, CRAB_SCALE, crab } from './svg-crab'
import { FIGURES, drawing, tag, words } from './svg-tag'
import { DESK } from './theme'

// Desktop crew pane: a dotted backdrop with one SVG per row on top, built the same
// way as the desktop band.

// Line height the pane's Text and Button rows are counted at: they draw at about
// 20px, and the backdrop would rather run long than short.
export const LINE_H = 24
// One dot to a square this many px across.
const DOT_PITCH = 16
// The engine draws no Svg taller than 4096px; a taller backdrop is several, each a
// whole number of dot squares so the dots line up across the seams.
const MAX_TILE = 4096

export const gridTiles = (total: number): number[] => {
  const tiles: number[] = []
  for (let left = total; left > 0; left -= MAX_TILE) tiles.push(Math.min(MAX_TILE, left))
  return tiles
}

// The backdrop is a repeating dot; the rows are transparent and it shows between them.
export const gridSvg = (W: number, h: number): string =>
  drawing(
    W,
    h,
    `<style>${DESK.grid}</style>`,
    tag('defs', {}, tag('pattern', { id: 'dots', width: DOT_PITCH, height: DOT_PITCH, patternUnits: 'userSpaceOnUse' }, tag('circle', { class: 'd', cx: DOT_PITCH / 2, cy: DOT_PITCH / 2, r: 1 }))),
    tag('rect', { width: W, height: h, fill: 'url(#dots)' }),
  )

// A row's words start right of its crab and stop short of its status mark.
const TEXT_X = 42
const MARK_ROOM = 22
const AGENT_H = 66
const PLANNED_H = 46
const COMPACT_H = 32
// Each crab of the collapsed row takes this much.
const SLOT = 36

// Light and dark ink, and the pulse of a running agent's dot, for those who allow motion.
const style = `<style>
${DESK.pane}
@keyframes pulse{50%{opacity:.3}}
@media (prefers-reduced-motion: no-preference){.live{animation:pulse 1.6s ease-in-out infinite}}
</style>`

const row = (W: number, h: number, ...body: string[]): string => drawing(W, h, style, CRAB_CSS, ...body)

// The rule under a row, on its last pixel.
const rule = (W: number, h: number): string => tag('line', { class: 'ln', x1: 0, y1: h - 0.5, x2: W, y2: h - 0.5 })

const stroke = (color: string): Record<string, string | number> => ({ fill: 'none', stroke: color, 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })

// At the row's right end: a pulsing dot while running, a check once done, a cross
// once failed, a clock while planned.
const statusMark = (x: number, y: number, status: AgentStatus | 'planned', color: string): string => {
  switch (status) {
    case 'running':
      return tag('circle', { class: 'live', cx: x, cy: y, r: 3.5, fill: color })
    case 'done':
      return tag('polyline', { points: `${x - 5},${y} ${x - 1.5},${y + 3.5} ${x + 5},${y - 3.5}`, ...stroke(DESK.done) })
    case 'failed':
      return [-1, 1].map(dir => tag('line', { x1: x - 4, y1: y - 4 * dir, x2: x + 4, y2: y + 4 * dir, ...stroke(DESK.failed) })).join('')
    default: {
      const thin = { ...stroke(DESK.planned), 'stroke-width': 1.4 }
      return tag('circle', { cx: x, cy: y, r: 5, ...thin }) + tag('polyline', { points: `${x},${y - 2.5} ${x},${y + 0.3} ${x + 1.8},${y + 1.5}`, ...thin })
    }
  }
}

// The second line of a row: the role in its colour, then what follows in `ink`.
const roleLine = (role: Role, ink: string, rest: string): string =>
  words(TEXT_X, 34, { size: 11 }, tag('tspan', { fill: colorOf(role) }, role), tag('tspan', { class: ink }, `  ${xml(rest)}`))

// With a flow, its title tops the header; below, the totals in three tiles.
export const headerHeight = (title: string): number => (title ? 72 : 44)

export const headerSvg = (W: number, title: string, t: Totals): string => {
  const gap = 6
  const tileW = (W - 2 * gap) / 3
  const top = headerHeight(title) - 44
  const stats: [string, string][] = [
    ['Cost', `≈${fmtCost(t.cost)}`],
    ['Tokens', fmtTokens(t.tokens)],
    ['Time', fmtTime(t.time)],
  ]
  const tiles = stats.map(([name, value], i) => {
    const left = i * (tileW + gap)
    return [
      tag('rect', { class: 'tile', x: left, y: top, width: tileW, height: 40, rx: 8 }),
      words(left + 9, top + 16, { ink: 's', size: 11 }, name),
      words(left + 9, top + 33, { ink: 't', size: 15, more: { 'font-weight': 600, ...FIGURES } }, value),
    ].join('')
  })
  const heading = title ? words(0, 15, { ink: 't', size: 14, more: { 'font-weight': 600 } }, xml(fitText(title, 14, W))) : ''
  return row(W, headerHeight(title), heading, ...tiles)
}

// A spawned agent: crab, title, role and meta, the step note and the stats, and its bar.
export const agentSvg = (W: number, a: AgentRun, at: number): string => {
  const role = roleOf(a.type, a.description)
  const color = colorOf(role)
  const span = W - TEXT_X - MARK_ROOM
  const ctx = ctxOf(a)
  const reported = progressOf(a)
  const meta = metaOf(a).join('  ·  ')
  const stats = [`ctx ${ctx}% · ${fmtTokens(a.contextTokens)}`, `≈${fmtCost(a.costUsd)}`, fmtTime(elapsed(a, at))].join('  ')
  // The step note is secondary ink beside the stats, the title the one bright line;
  // it is left out when too little room is left for it.
  const noteRoom = Math.max(0, span - textWidth(stats, 11) - 12)
  const note = stepsOf(a)
  // No step reports yet: fill by context use, in the role's muted colour, matching
  // the terminal.
  const filled = Math.round(span * (reported ?? ctx / 100))
  return row(
    W,
    AGENT_H,
    crab(0, 14, role, false, a.status === 'running', CRAB_SCALE),
    words(TEXT_X, 18, { ink: 't', size: 13, more: { 'font-weight': 600 } }, xml(fitText(a.description || a.type, 13, span))),
    roleLine(role, 's', fitText(meta, 11, Math.max(40, span - textWidth(role, 11) - 10))),
    note && noteRoom > 30 ? words(TEXT_X, 49, { ink: 's', size: 11, more: FIGURES }, xml(fitText(note, 11, noteRoom))) : '',
    words(TEXT_X + span, 49, { ink: 's', size: 11, more: { 'text-anchor': 'end', ...FIGURES } }, stats),
    tag('rect', { class: 'k', x: TEXT_X, y: 55, width: span, height: 4, rx: 2 }),
    tag('rect', { x: TEXT_X, y: 55, width: filled, height: 4, rx: 2, fill: reported === null ? dimColorOf(role) : color }),
    statusMark(W - 8, 16, a.status, color),
    rule(W, AGENT_H),
  )
}

// A task the plan holds that no agent has picked up: a dimmed crab and what it waits on.
export const plannedSvg = (W: number, p: Planned): string => {
  const role = p.role || 'other'
  const waits = p.after.length ? `after ${p.after.join(', ')}` : ''
  return row(
    W,
    PLANNED_H,
    crab(0, 6, role, true, false, CRAB_SCALE),
    words(TEXT_X, 18, { ink: 's', size: 13, more: { 'font-weight': 600 } }, xml(fitText(`${p.n}. ${p.title}`, 13, W - TEXT_X - MARK_ROOM))),
    roleLine(role, 'm', waits),
    statusMark(W - 8, 16, 'planned', colorOf(role)),
    rule(W, PLANNED_H),
  )
}

// The collapsed pane: a crab for each agent, running ones first then planned tasks,
// as many as fit, a count of the rest, and the totals at the right.
export const compactSvg = (W: number, list: AgentRun[], planned: Planned[], t: Totals): string => {
  type Crew = { role: Role; isRunning: boolean; isPlanned: boolean }
  const spawned = list.map((a): Crew => ({ role: roleOf(a.type, a.description), isRunning: a.status === 'running', isPlanned: false }))
  const crew = [...spawned.filter(c => c.isRunning), ...spawned.filter(c => !c.isRunning), ...planned.map((p): Crew => ({ role: p.role || 'other', isRunning: false, isPlanned: true }))]
  const shown = crew.slice(0, Math.max(1, Math.floor((W - 150) / SLOT)))
  const hidden = crew.length - shown.length
  const crabs = shown.map((c, i) => {
    const left = i * SLOT
    const dot = c.isRunning ? tag('circle', { class: 'live', cx: left + 32, cy: 4, r: 3, fill: colorOf(c.role) }) : ''
    return crab(left, 0, c.role, c.isPlanned, c.isRunning, CRAB_SCALE) + dot
  })
  const rest = hidden ? words(shown.length * SLOT + 4, 21, { ink: 's', size: 12 }, `+${hidden}`) : ''
  const sums = [`≈${fmtCost(t.cost)}`, fmtTokens(t.tokens), fmtTime(t.time)].join(' · ')
  return row(W, COMPACT_H, ...crabs, rest, words(W, 21, { ink: 's', size: 12, more: { 'text-anchor': 'end', ...FIGURES } }, sums))
}

import type { Flow, Role } from '../types'
import { bandLabel, ratio } from './flow'
import { fitText, textWidth, xml } from './format'
import { noise } from './noise'
import { CRAB_CSS, crab } from './svg-crab'
import { FIGURES, drawing, tag, words } from './svg-tag'
import { BAND, DESK } from './theme'

// The band on the desktop is a single SVG row (the desktop would wrap sibling
// elements): status dot, title, bar, percentage and crab. The `×N` count and the ✕
// are separate Buttons next to it. The bar is the terminal's: a periwinkle pill
// carrying the label, grown to the flow's progress, and a track of twinkling stars
// beyond it with the task boundaries still ahead.
export const H = 22
const BAR_H = 16
const MID = H / 2
// Where the row's text sits on its line.
const BASELINE = MID + 4.5
// The crab's slot at the row's end, and the room the percentage takes before it.
const CRAB_SLOT = 26
const PERCENT_ROOM = 46
// One star to about this many px of open track.
const LANE = 13

// The bar's stars: at fixed places along it, so a step forward only covers some,
// each on one of three heights and at its own beat, seen past `open` alone.
const stars = (open: number, barW: number, marks: number[]): string => {
  let out = ''
  for (let lane = 0; lane * LANE < barW; lane++) {
    const x = lane * LANE + 3 + Math.round(noise(lane, 2) * 6)
    if (x < open + 6 || x > barW - 7 || marks.some(m => Math.abs(m - x) < 4)) continue
    const y = 4 + 4 * Math.floor(noise(lane, 5) * 3)
    const r = noise(lane, 9) > 0.8 ? 1.3 : 0.9
    out += tag('circle', { class: 'm star', cx: x, cy: y, r, style: `animation-delay:-${noise(lane, 7).toFixed(2)}s` })
  }
  return out
}

// Light and dark from the desktop's scheme; the stars' beat stops for less motion.
const style = `<style>
${DESK.band}
.star{animation:twinkle 1s ease-in-out infinite}
@keyframes twinkle{50%{opacity:.2}}
@media (prefers-reduced-motion: reduce){.star{animation:none}}
</style>`

// `costume` dresses the crab as the agent now at work; it walks while any agent runs.
export const rowSvg = (f: Flow, W: number, running: number, costume: Role): string => {
  const share = ratio(f)
  const tint = f.isFinished ? BAND.done : BAND.fill
  // The title may claim 40% of the width; the bar fills what the percentage and crab leave.
  const titleRoom = Math.max(60, W * 0.4)
  const title = fitText(f.title, 13, titleRoom)
  const barX = Math.round(textWidth(title, 13) + 28)
  const barW = Math.max(60, W - barX - PERCENT_ROOM - CRAB_SLOT)

  // The pill is never narrower than its label, so a flow at 0% still names its phase.
  const label = bandLabel(f, running)
  const labelW = Math.round(label.length * 6.6 + 18)
  const pill = f.isFinished ? barW : Math.min(barW, Math.max(labelW, Math.round(barW * share)))
  // Tasks handed out and not yet done: the pill's colour, faint, ahead of it.
  const handed = f.total ? Math.round((barW * Math.min(f.total, f.done + running)) / f.total) : 0
  const marks: number[] = []
  for (let task = f.done + 1; task < f.total; task++) {
    const at = Math.round((barW * task) / f.total)
    if (at > pill + 4 && at < barW - 4) marks.push(at)
  }

  const round = BAR_H / 2
  const bar = [
    tag('rect', { class: 'k', width: barW, height: BAR_H, rx: round }),
    handed > pill ? tag('rect', { width: handed, height: BAR_H, rx: round, fill: tint, opacity: 0.35 }) : '',
    stars(Math.max(pill, handed), barW, marks),
    ...marks.map(at => tag('rect', { class: 'tk', x: at - 0.75, y: round - 4, width: 1.5, height: 8, rx: 0.75 })),
    tag('rect', { width: pill, height: BAR_H, rx: round, fill: tint }),
    words(pill / 2, round + 4, { size: 11, more: { 'text-anchor': 'middle', 'font-weight': 600, fill: BAND.ink } }, xml(label)),
  ]

  return drawing(
    W,
    H,
    style,
    tag('circle', { cx: 5, cy: MID, r: 4, fill: tint }),
    words(16, BASELINE, { ink: 't', size: 13, more: { 'font-weight': 500 } }, xml(title)),
    tag('g', { transform: `translate(${barX},${(H - BAR_H) / 2})` }, ...bar),
    words(W - CRAB_SLOT - 6, BASELINE, { ink: 'm', size: 12.5, more: { 'text-anchor': 'end', ...FIGURES } }, `${Math.round(share * 100)}%`),
    CRAB_CSS,
    crab(W - CRAB_SLOT + 1, 0, costume, false, running > 0, 0.8),
  )
}

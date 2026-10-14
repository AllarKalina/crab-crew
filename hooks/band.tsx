import { read, update, atom } from 'claude-code'
import type { On, PluginOptions } from 'claude-code'

import { bandLabel, plannedOf, ratio, runningOf, withLiveCounts } from './flow'
import { clipCells } from './format'
import { colorOf, roleOf } from './roles'
import { CAPS, glyphsOf } from './glyphs'
import { svgSurface } from './surface'
import { H, rowSvg } from './svg-band'
import { CRAB_CELLS, barCells, crabInTrack, fitRow, pillOf, rasterAt } from './term-bar'
import type { BarState } from './term-bar'
import { CRAB, CRABS, crabFrame, hurryOf, tintOf } from './term-crab'
import { BAND, M } from './theme'

// The engine lists what a module reads and writes from references written in that
// module, so each file names the state it uses.
const flow = atom({ plugin: 'crab-crew', key: 'flow' } as const, null)
const agents = atom({ plugin: 'crab-crew', key: 'agents' } as const, [])
const pose = atom({ plugin: 'crab-crew', key: 'pose' } as const, CRAB)

// The band's bar as last drawn, for the timer that keeps its stars adrift and its
// crab walking. A reload starts these over and the next draw sets them again. One
// slot: with two terminals drawing the band, the last drawn gets the blits.
export const BAR = 'crew-bar'
let band: { requestId: string; state: BarState; title: string; frame: string; cells: string } | null = null
let tick = 0

// What changed at the timer's next frame of about 150ms: the crab's frame, which
// redraws the band (Text is out of a blit's reach), and the track's cells, to blit
// in place. Nothing changes on a finished bar, so it holds still and costs nothing.
// `drop` forgets a bar the blit could not reach; the next draw sets it again.
export const nextFrame = (): { requestId: string; frame?: string; cells?: string; drop: () => void } | null => {
  tick++
  const site = band
  if (!site || site.state.isFinished) return null
  const t = tick
  const frame = crabInTrack(site.state) ? crabFrame(site.state, t) : CRAB
  const cells = barCells(site.state, t)
  const out = {
    requestId: site.requestId,
    frame: frame === site.frame ? undefined : frame,
    cells: cells === site.cells ? undefined : cells,
    drop: () => {
      if (band === site) band = null
    },
  }
  site.frame = frame
  site.cells = cells
  return out
}

// The progress band above the prompt. The desktop gets one SVG row; a terminal gets
// text cells: title, pill, crab, starry track, percentage and crew count.
export const bandHooks = (on: On, options: PluginOptions): void => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, ev, next) => {
    const stored = await read($, flow)
    if (stored === null || stored.isHidden || ev.props.hasSurvey) {
      band = null
      return next(ev)
    }
    // Ours is the top row; bands from further down the render chain stack under it.
    // The engine's stand-in node ({ type: 'engine' }) is left out, since the desktop
    // throws away any band that contains one.
    const rest = await Promise.resolve(next(ev)).catch(() => null)
    const keepRest = typeof rest === 'object' && rest !== null && (rest as { type?: string }).type !== 'engine'
    const below = keepRest ? rest : null

    const ui = $.ui.resolve(ev)
    const { Box, Button, Text } = ui
    const runs = await read($, agents)
    const shown = withLiveCounts(stored, runs)
    const running = runningOf(runs)
    const r = ratio(shown)
    const label = bandLabel(shown, running)
    const pct = Math.round(r * 100) + '%'
    const headcount = '×' + (runs.length + plannedOf(shown, runs).length)
    // Dress the band's crab as the agent working right now, else the latest one.
    const lead = runs.findLast(a => a.status === 'running') ?? runs.at(-1)
    const costume = lead === undefined ? 'other' : roleOf(lead.type, lead.description)
    // Pressing it is handled in register.tsx, next to the code that opens the pane.
    const noop = () => undefined
    const crewButton = <Button key="crew-open" label={headcount} plain onPress={noop} />
    const hide = () => update($, flow, cur => (cur ? { ...cur, isHidden: true } : cur))
    const dismiss = <Button key="crew-dismiss" label="✕" plain role="dismiss" onPress={hide} />

    if (svgSurface(ev.surface, ui)) {
      const { Svg } = ui
      // A reported column is roughly 8 CSS px; 96 px go to the count, the ✕ and the
      // gaps. The upper bound is the slot itself: anything wider would wrap.
      const columns = ev.props.bodyColumns || 100
      const width = Math.max(180, Math.min(1600, columns * 8 - 96))
      const row = (
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Svg source={rowSvg(shown, width, running, costume)} alt={`${shown.title}: ${label}, ${pct}`} width={width} height={H} />
          {crewButton}
          {dismiss}
        </Box>
      )
      return <Box flexDirection="column">{row}{below}</Box>
    }

    // A terminal always offers Raster; testing for it narrows the element table's type.
    if (!('Raster' in ui)) {
      band = null
      return <Box flexDirection="column">{below}</Box>
    }
    const { Raster } = ui
    // Reading `pose` subscribes this draw to the timer, and doing it before the tick is
    // sampled keeps draw and timer on the same tick. `pose` exists only to trigger
    // redraws as the crab steps; invalidating 'ui.render' would redraw the pane as well.
    await read($, pose)
    const t = tick
    const { gap, titleW, barW } = fitRow(ev.props.bodyColumns, shown.title, label, pct, headcount)
    const glyphs = glyphsOf(options)
    // Comparing with the previous draw of this flow shows whether it moved forward. A
    // finished flow is closed: a new one with the same title begins from scratch.
    const prev = band?.title === shown.title && !band.state.isFinished ? band.state : undefined
    // Crab colour follows the working agent's role (plain grey before any): as is when
    // resting beside the percentage, lightened by `tintOf` when walking on the track.
    const restColor = colorOf(costume)
    const state: BarState = {
      columns: barW,
      ratio: r,
      isFinished: shown.isFinished,
      glyphs,
      label,
      total: shown.total,
      done: shown.done,
      isWalking: running > 0,
      hurryUntil: hurryOf(prev, r, t),
    }
    const fill = shown.isFinished ? BAND.done : BAND.fill
    const room = pillOf(state) - 1 - label.length
    const pad = (k: number) => ' '.repeat(Math.max(0, k))
    const cells = barCells(state, t)
    const frame = crabInTrack(state) ? crabFrame(state, t) : null
    band = ev.requestId ? { requestId: ev.requestId, state, title: shown.title, frame: frame ?? CRAB, cells } : null
    const row = (
      <Box key="crew-row" flexDirection="row" gap={gap}>
        <Box flexDirection="row" flexShrink={0}>
          <Text color={fill}>{titleW ? '● ' : '●'}</Text>
          {titleW ? (
            <Text bold color={M.text}>
              {clipCells(shown.title, titleW)}
            </Text>
          ) : null}
        </Box>
        <Box flexDirection="row" flexShrink={0}>
          <Text color={fill}>{String.fromCodePoint(CAPS[glyphs][0])}</Text>
          <Text backgroundColor={fill}>{pad(Math.floor(room / 2))}</Text>
          <Text bold color={BAND.ink} backgroundColor={fill}>
            {label}
          </Text>
          <Text backgroundColor={fill}>{pad(Math.ceil(room / 2))}</Text>
          {/* The walking crab sits in its own Box: a fragment would be laid out as a
              column and drop the crab one row under the pill's end cap. That rounded
              cap stays on the track in the pill's colour, and the crab comes right
              after it, one track column away. */}
          {frame ? (
            <Box key="crew-crab" flexDirection="row" flexShrink={0} width={1 + CRAB_CELLS}>
              <Text color={fill} backgroundColor={BAND.track}>
                {String.fromCodePoint(CAPS[glyphs][1])}
              </Text>
              <Text color={tintOf(costume)} backgroundColor={BAND.track}>
                {frame}
              </Text>
            </Box>
          ) : null}
          <Raster key={BAR} columns={barW - pillOf(state) - rasterAt(state)} rows={1} cells={cells} />
        </Box>
        <Box flexDirection="row" gap={1} flexShrink={0}>
          <Text color={M.overlay1}>{pct}</Text>
          {frame ? null : <Text color={restColor}>{CRABS[glyphs].rest}</Text>}
        </Box>
        {crewButton}
        {dismiss}
      </Box>
    )
    return <Box flexDirection="column">{row}{below}</Box>
  })
}

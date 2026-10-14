import { atom, read, update } from 'claude-code'
import type { On, PluginOptions, RenderNode } from 'claude-code'

import type { AgentRun, Flow, Panel, Role } from '../types'
import { PANEL_DEFAULT } from './defaults'
import { plannedOf, totals, withLiveCounts } from './flow'
import type { Planned } from './flow'
import { cells, clipCells, fmtCost, fmtTime, fmtTokens, modelName } from './format'
import { caretOf, glyphsOf } from './glyphs'
import type { Glyphs } from './glyphs'
import { colorOf, dimColorOf, roleOf } from './roles'
import { STATUS_GLYPH, ctxOf, elapsed, metaOf, progressOf, stepsOf } from './runs'
import { svgSurface } from './surface'
import { LINE_H, agentSvg, compactSvg, gridSvg, gridTiles, headerHeight, headerSvg, plannedSvg } from './svg-pane'
import { CRAB_COLS, CRAB_ROWS, crabCells } from './term-sprite'
import { M } from './theme'

const flow = atom({ plugin: 'crab-crew', key: 'flow' } as const, null)
const agents = atom({ plugin: 'crab-crew', key: 'agents' } as const, [])
const panel = atom({ plugin: 'crab-crew', key: 'panel' } as const, PANEL_DEFAULT)
const now = atom({ plugin: 'crab-crew', key: 'now' } as const, 0)

// Heights of the desktop drawings, in px: a run, a planned task, the collapsed row.
const AGENT_H = 66
const PLANNED_H = 46
const COMPACT_H = 32

const EMPTY = 'No subagents yet.'

// What either surface shows, worked out once: runs newest first and split by
// whether they still run, plan tasks no run has taken, the totals up to `at`, and
// the flow's name while it is open (the surface already titles the pane "Crew").
const crewOf = (list: AgentRun[], stored: Flow | null, clock: number) => {
  const f = stored && withLiveCounts(stored, list)
  const at = Math.max(0, clock, ...list.map(a => a.startedAt))
  const newestFirst = [...list].reverse()
  const untaken = plannedOf(f, list)
  return {
    f,
    at,
    running: newestFirst.filter(a => a.status === 'running'),
    finished: newestFirst.filter(a => a.status !== 'running'),
    planned: untaken,
    totals: totals(list, at),
    title: f && !f.isFinished ? f.title : '',
    isEmpty: !list.length && !untaken.length,
  }
}

// Desktop width from the reported columns, at about 8px each, kept to 240-900px.
const desktopWidth = (columns: number): number => Math.min(900, Math.max(240, columns * 8 - 8))

// A terminal row's stats beside its step note. The note gets the room it needs:
// first the context fill goes, then the cost; a note too long even beside the
// tokens alone is cut there.
const statsBeside = (a: AgentRun, steps: string, width: number): string => {
  const tokens = fmtTokens(a.contextTokens)
  const cost = `≈${fmtCost(a.costUsd)}`
  const full = `ctx ${ctxOf(a)}% · ${tokens} · ${cost}`
  const room = (stats: string) => width - cells(stats) - 2
  if (!a.stepNote || cells(steps) <= room(full)) return full
  const lean = `${tokens} · ${cost}`
  return cells(steps) <= room(lean) ? lean : tokens
}

// The crew pane: one row per subagent spawned this session, then the plan's tasks still waiting.
export const paneHooks = (on: On, options: PluginOptions): void => {
  // The literal is `PANE` from register.tsx, written out for the engine's site listing.
  on('ui.render', { component: 'Pane', requestId: 'crew' }, async ($, ev, next) => {
    const ui = $.ui.resolve(ev)
    const { Box, Button, Text } = ui
    const runs = await read($, agents)
    const stored = await read($, flow)
    const prefs: Panel = await read($, panel)
    const crew = crewOf(runs, stored, await read($, now))
    const { f, at, running, finished, planned, title, isEmpty } = crew
    const sum = crew.totals
    const shownFinished = prefs.isDoneCollapsed ? [] : finished

    const flip = (key: 'isCompact' | 'isDoneCollapsed') => () => update($, panel, (prev): Panel => ({ ...prev, [key]: !prev[key] }))
    const toggleCompact = <Button key="compact" label={prefs.isCompact ? 'Expand' : 'Collapse'} plain dimColor onPress={flip('isCompact')} />
    // One Button is the whole Finished heading, caret after the count, so a single
    // press and a single focus serve it. Buttons take no colour and draw dim, so the
    // Running and Planned headings are dim Text alike. The caret's glyphs come from
    // the surface: the desktop font has no Nerd glyphs.
    const toggleDone = (glyphs: Glyphs) => (
      <Button key="done" label={`Finished · ${finished.length} ${caretOf(glyphs, prefs.isDoneCollapsed)}`} plain dimColor onPress={flip('isDoneCollapsed')} />
    )
    const summary = `≈${fmtCost(sum.cost)}, ${fmtTokens(sum.tokens)} tokens, ${fmtTime(sum.time)}`

    if (svgSurface(ev.surface, ui)) {
      const { Svg } = ui
      const W = desktopWidth(ev.props.bodyColumns || 40)
      const sectionHead = (key: string, text: string) => <Text key={key} dimColor>{text}</Text>

      if (prefs.isCompact) {
        const compactAlt = `${runs.length} agents, ${summary}`
        return (
          <Box gap={1} flexDirection="column">
            <Svg source={compactSvg(W, runs, planned, sum)} alt={compactAlt} width={W} height={COMPACT_H} />
            {toggleCompact}
          </Box>
        )
      }

      const headH = headerHeight(title)
      const headAlt = title ? `${title}: ${summary}` : summary
      // Text lines between the drawings: the size toggle, then the empty note and
      // each section heading that shows.
      const textLines = [true, isEmpty, running.length > 0, finished.length > 0, planned.length > 0].filter(Boolean).length
      const contentH = headH + textLines * LINE_H + (running.length + shownFinished.length) * AGENT_H + planned.length * PLANNED_H
      const runCard = (a: AgentRun, state: string) => {
        const alt = [roleOf(a.type, a.description), a.description, modelName(a.model), state].join(' · ')
        return <Svg key={a.id} source={agentSvg(W, a, at)} alt={alt} width={W} height={AGENT_H} />
      }
      // The dotted grid is what gives the pane its height; the content box is
      // absolute, so it lies on top of the grid tiles drawn before it.
      const backdrop = gridTiles(contentH).map((tileH, i) => <Svg key={`grid-${i}`} alt="dotted grid" source={gridSvg(W, tileH)} width={W} height={tileH} />)
      const content = (
        <Box position="absolute" top={0} left={0} right={0} flexDirection="column">
          <Svg source={headerSvg(W, title, sum)} alt={headAlt} width={W} height={headH} />
          {toggleCompact}
          {isEmpty && <Text dimColor>{EMPTY}</Text>}
          {running.length > 0 && sectionHead('h-run', `Running · ${running.length}`)}
          {running.map(a => runCard(a, 'running'))}
          {finished.length > 0 && toggleDone('plain')}
          {shownFinished.map(a => runCard(a, 'finished'))}
          {planned.length > 0 && sectionHead('h-plan', `Planned · ${planned.length}`)}
          {planned.map(pl => (
            <Svg key={`plan-${pl.n}`} source={plannedSvg(W, pl)} alt={`${pl.n}. ${pl.title}: planned`} width={W} height={PLANNED_H} />
          ))}
        </Box>
      )
      return <Box flexDirection="column">{backdrop}{content}</Box>
    }

    // In the terminal the crew is drawn in cells and the terminal's own palette,
    // with one column of margin either side.
    const paneCols = Math.max(32, ev.props.bodyColumns || 40)
    const cols = paneCols - 2
    // Every terminal has a Raster; the check narrows the table.
    if (!('Raster' in ui)) return next(ev)
    const { Raster } = ui
    const textW = Math.max(14, cols - CRAB_COLS - 1)
    // A running crab steps once a second, on the clock that redraws its row.
    const frame = Math.floor(at / 1000) % 2
    const crab = (key: string, role: Role, isWalking: boolean, dim = false) => (
      <Raster key={`crab-${key}`} columns={CRAB_COLS} rows={CRAB_ROWS} cells={crabCells(role, isWalking ? frame : null, dim)} />
    )
    const rule = (key: string) => <Text key={key} color={M.surface0}>{'─'.repeat(cols)}</Text>
    // Layout pieces the rows share.
    const ends = (left: RenderNode, right: RenderNode) => <Box justifyContent="space-between" flexDirection="row">{left}{right}</Box>
    const truncated = (a: RenderNode, b: RenderNode) => <Text wrap="truncate-end">{a}{b}</Text>
    const besideCrab = (sprite: RenderNode, body: RenderNode) => <Box gap={1} flexDirection="row">{sprite}{body}</Box>
    const entry = (key: string, body: RenderNode) => <Box key={key} flexDirection="column">{body}{rule(`rule-${key}`)}</Box>
    // Three tiles and two gaps span the content; the last takes the odd columns. The
    // caption in subtext0, 5.6 to 1 off the tile (overlay1 was 3.4); the value bold.
    const tileW = Math.floor((cols - 2) / 3)
    const tile = (k: string, v: string, width = tileW) => (
      <Box key={k} flexDirection="column" width={width} paddingX={1} backgroundColor={M.surface0}>
        <Text color={M.subtext0} backgroundColor={M.surface0}>
          {k}
        </Text>
        <Text bold color={M.text} backgroundColor={M.surface0}>
          {v}
        </Text>
      </Box>
    )
    // A heading below another section's rows stands a line clear of them; a label is
    // drawn dim, as the Finished Button is.
    const heading = (key: string, label: RenderNode, isAfter: boolean) => (
      <Box key={key} marginTop={isAfter ? 1 : 0}>
        {typeof label === 'string' ? <Text dimColor>{label}</Text> : label}
      </Box>
    )

    const runRow = (a: AgentRun) => {
      const role = roleOf(a.type, a.description)
      const color = colorOf(role)
      const share = progressOf(a)
      const time = fmtTime(elapsed(a, at))
      const steps = stepsOf(a)
      const stats = statsBeside(a, steps, textW)
      const stepsW = textW - cells(stats) - 2
      // With no step count the bar shows the context instead, in the role's colour
      // dimmed toward the base, so it never passes for the task's progress.
      const filled = Math.round(textW * (share ?? ctxOf(a) / 100))
      const fill = share === null ? dimColorOf(role) : color
      const mark = a.status === 'failed' ? M.red : a.status === 'done' ? M.green : color
      const timeAndMark = (
        <Text>
          <Text color={M.overlay1}>{time} </Text>
          <Text color={mark}>{STATUS_GLYPH[a.status]}</Text>
        </Text>
      )
      const meta = clipCells(` · ${metaOf(a).join(' · ')}`, textW - cells(role))
      const bar = (
        <Text>
          <Text color={fill}>{'━'.repeat(filled)}</Text>
          <Text color={M.surface1}>{'━'.repeat(Math.max(0, textW - filled))}</Text>
        </Text>
      )
      const body = (
        <Box flexDirection="column" width={textW}>
          {ends(<Text bold color={M.text}>{clipCells(a.description || a.type, textW - time.length - 4)}</Text>, timeAndMark)}
          {truncated(<Text color={color}>{role}</Text>, <Text color={M.subtext0}>{meta}</Text>)}
          {ends(<Text color={M.subtext0}>{stepsW > 4 ? clipCells(steps, stepsW) : ''}</Text>, <Text color={M.overlay1}>{stats}</Text>)}
          {bar}
        </Box>
      )
      return entry(a.id, besideCrab(crab(a.id, role, a.status === 'running'), body))
    }

    const planRow = (pl: Planned) => {
      const role = pl.role || 'other'
      const key = `plan-${pl.n}`
      const waits = pl.after.length ? clipCells(` · after ${pl.after.join(', ')}`, textW - cells(role)) : ''
      // Level with the crab's top, as a running or finished row's title is.
      const body = (
        <Box flexDirection="column" width={textW}>
          {ends(<Text color={M.subtext0}>{clipCells(`${pl.n}. ${pl.title}`, textW - 2)}</Text>, <Text color={M.overlay0}>{STATUS_GLYPH.planned}</Text>)}
          {truncated(<Text color={colorOf(role)}>{role}</Text>, <Text color={M.overlay1}>{waits}</Text>)}
        </Box>
      )
      return entry(key, besideCrab(crab(key, role, false, true), body))
    }

    // The collapsed pane: one crab per run and planned task, as many as fit, then a count.
    const everyone = [
      ...[...running, ...finished].map(a => ({ key: a.id, role: roleOf(a.type, a.description), isWalking: a.status === 'running', dim: false })),
      ...planned.map(pl => ({ key: `plan-${pl.n}`, role: pl.role || 'other', isWalking: false, dim: true }) as const),
    ]
    const fit = Math.max(1, Math.floor(cols / (CRAB_COLS + 1)))
    const compact = () => (
      <Box gap={1} marginTop={1} flexDirection="row">
        {isEmpty && <Text color={M.overlay1}>{EMPTY}</Text>}
        {everyone.slice(0, fit).map(c => crab(c.key, c.role, c.isWalking, c.dim))}
        {everyone.length > fit && <Text color={M.overlay1}>+{everyone.length - fit}</Text>}
      </Box>
    )
    const expanded = () => (
      <Box marginTop={1} flexDirection="column">
        {isEmpty && <Text color={M.overlay1}>{EMPTY}</Text>}
        {running.length > 0 && heading('h-run', `Running · ${running.length}`, false)}
        {running.map(runRow)}
        {finished.length > 0 && heading('h-done', toggleDone(glyphsOf(options)), running.length > 0)}
        {shownFinished.map(runRow)}
        {planned.length > 0 && heading('h-plan', `Planned · ${planned.length}`, running.length + finished.length > 0)}
        {planned.map(planRow)}
      </Box>
    )

    // The pane's own backdrop is a neutral grey; the panel lays the terminal's base over all of it.
    const paneRows = ev.props.scroll?.bodyRows ?? 0
    return (
      <Box flexDirection="column" width={paneCols} minHeight={paneRows} paddingX={1} backgroundColor={M.base}>
        {/* The toggle stops short of the pane's own close mark in the corner. */}
        <Box flexDirection="row" justifyContent="space-between" paddingRight={2} marginBottom={1}>
          <Text bold color={f?.isFinished ? M.subtext0 : M.text}>
            {clipCells(f?.title || 'Crew', cols - 14)}
          </Text>
          {toggleCompact}
        </Box>
        <Box gap={1} flexDirection="row">
          {tile('Cost', `≈${fmtCost(sum.cost)}`)}
          {tile('Tokens', fmtTokens(sum.tokens))}
          {tile('Time', fmtTime(sum.time), cols - 2 - tileW * 2)}
        </Box>
        {prefs.isCompact ? compact() : expanded()}
      </Box>
    )
  })
}

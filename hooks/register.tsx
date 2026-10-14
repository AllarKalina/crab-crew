import { atom, read, update } from 'claude-code'
import type { EngineInterface, PaneOpenArgs, Register, UiOpenResult } from 'claude-code'

import type { Flow, Panel } from '../types'
import { BAR, bandHooks, nextFrame } from './band'
import { PANEL_DEFAULT } from './defaults'
import { autoFlow, bandLabel, emptyFlow, isNewFlow, mergeReport, progressInput, promptTitle, runningOf, stepInput } from './flow'
import { paneHooks } from './pane'
import { addRun, applyStep, applyUsage, finishRun, withRun } from './runs'
import { CRAB } from './term-crab'
import { PROGRESS_SPEC, STEP_BRIEF, STEP_SPEC, STEP_TOOL } from './tools'

// The engine learns a module's state from the atoms written in that module, so
// every file declares the ones it touches.
const flow = atom({ plugin: 'crab-crew', key: 'flow' } as const, null)
const agents = atom({ plugin: 'crab-crew', key: 'agents' } as const, [])
const panel = atom({ plugin: 'crab-crew', key: 'panel' } as const, PANEL_DEFAULT)
const now = atom({ plugin: 'crab-crew', key: 'now' } as const, 0)
const turn = atom({ plugin: 'crab-crew', key: 'turn' } as const, { isActive: false, prompt: '' })
const pose = atom({ plugin: 'crab-crew', key: 'pose' } as const, CRAB)

// The crew pane's id. Matchers repeat it as a literal (here and in pane.tsx): the
// engine reads a matcher's literal to list where a module draws.
const PANE = 'crew'
const PANE_REF = { id: PANE } as const

const CREW_COMMAND = {
  name: 'crew',
  description:
    'Toggle the crew panel, listing subagents that are running, done or planned, each with role, model, context use, cost and elapsed time. `/crew open` opens and focuses it; `/crew bar` restores a progress bar closed with ✕',
}

// A tool call turned down, and why.
const ignored = (why: string) => ({ result: `ignored: ${why}` })

// Known to the surface at all: drawn, waiting to be drawn, or behind another tab. A
// reload forgets the pane; a narrow terminal or a tab only hides it.
const isPaneListed = async ($: EngineInterface): Promise<boolean> => (await $.ui.panes()).some(({ id }) => id === PANE)

// Actually drawn, in front or behind another tab. Only then does a toggle close it:
// opening an id that is already open just retitles it, so a toggle that tried to
// open a hidden pane would never get to close it.
const isPanePlaced = async ($: EngineInterface): Promise<boolean> => (await $.ui.panes()).some(({ id, isPlaced }) => id === PANE && isPlaced)

// Remembers whether the pane is up, for a reload to put it back.
const markOpen = ($: EngineInterface, isOpen: boolean) => update($, panel, prev => ({ ...prev, isOpen }))

// The panel clocks catch up with the engine's; the time is handed back.
async function syncNow($: EngineInterface): Promise<number> {
  const t = await $.clock.now()
  await update($, now, () => t)
  return t
}

// Asks for the pane; null when a hook turned the open down (`{ deny }` rejects the
// call). Only an open the engine took is marked, so a reload never retries a refused
// one. Drawn or waiting undrawn, the pane counts as open.
async function openPane($: EngineInterface, more: Pick<PaneOpenArgs, 'focus'> = {}): Promise<UiOpenResult | null> {
  const answer = await $.ui.open({ ...PANE_REF, title: 'Crew', ...more }).catch(() => null)
  if (answer) await markOpen($, true)
  return answer
}

// Opened at the person's request, with its clocks current before the first draw.
// `focus` brings it forward with the keys, which the surface allows only while the
// composer is empty.
async function showPane($: EngineInterface, more: Pick<PaneOpenArgs, 'focus'> = {}): Promise<string> {
  await syncNow($)
  const answer = await openPane($, more)
  if (!answer) return 'Crew panel not opened: the open was refused.'
  if (!answer.isPlaced) return `Crew panel open, not drawn yet: ${answer.reason}`
  return 'Crew panel opened.'
}

// Drawn (even behind a tab): close it. Not open, or open but undrawn: open it, and
// at the person's request it draws at any width.
async function togglePane($: EngineInterface): Promise<string> {
  if (!(await isPanePlaced($))) return showPane($)
  // Our own close skips our `ui.close` hook, so the mark is cleared here.
  await markOpen($, false)
  await $.ui.close(PANE_REF)
  return 'Crew panel closed.'
}

// `/crew bar`: brings back the bar the band's ✕ hid.
async function showBar($: EngineInterface): Promise<string> {
  if (!(await read($, flow))) return 'No flow yet: the bar appears when a subagent starts.'
  await update($, flow, prev => (prev ? { ...prev, isHidden: false } : prev))
  return 'Progress bar shown.'
}

// The autoOpen option decides how often the mod opens the pane by itself: once a
// session, once per flow, or never ('off'). The mark is what makes it once.
async function autoOpen($: EngineInterface, mode: unknown): Promise<void> {
  if (mode === 'off') return
  const scope: Panel['autoOpenedFor'] = mode === 'flow' ? 'flow' : 'session'
  if ((await read($, panel)).autoOpenedFor === scope) return
  await update($, panel, prev => ({ ...prev, autoOpenedFor: scope }))
  // Awaited, so the open mark lands while the hook still runs.
  await openPane($)
}

// A new flow, whatever its title, may open the pane again under the 'flow' option.
const forgetFlowOpen = ($: EngineInterface) =>
  update($, panel, (prev): Panel => (prev.autoOpenedFor === 'flow' ? { ...prev, autoOpenedFor: '' } : prev))

// Ended runs belong to the flow that is over; agents still at work carry on.
const keepRunning = ($: EngineInterface) => update($, agents, runs => runs.filter(r => r.status === 'running'))

// The mod's own flow closes once every agent it counted has ended and the main loop
// is idle.
async function settle($: EngineInterface): Promise<void> {
  const current = await read($, flow)
  if (!current?.isAuto || current.isFinished) return
  const runs = await read($, agents)
  if (runs.length === 0 || runningOf(runs) > 0) return
  if ((await read($, turn)).isActive) return
  await update($, flow, (prev): Flow | null => (prev?.isAuto ? { ...prev, phase: 'close', isFinished: true } : prev))
}

export const register: Register = (on, opts) => {
  on('session.start', async ($, ev, next) => {
    const result = await next(ev)
    await $.tool.register(PROGRESS_SPEC)
    await $.tool.register(STEP_SPEC)
    await $.command.register(CREW_COMMAND)

    // Once a second the running rows' times move on; with none running, nothing is written.
    $.clock.every(1000, () => void read($, agents).then(runs => (runningOf(runs) > 0 ? syncNow($) : undefined)))
    // Between redraws the band's stars drift and its crab walks.
    $.clock.every(150, () => {
      const moved = nextFrame()
      if (!moved) return
      const { requestId, frame, cells, drop } = moved
      if (frame) void update($, pose, () => frame)
      // A blit not taken answers `{ deny }` and a broken one rejects: both drop the frame.
      if (cells) void $.ui.blit({ requestId, key: BAR, cells }).then(r => (r.deny !== undefined ? drop() : undefined), drop)
    })
    // A reload takes the pane away without a word: put it back if it was up.
    const wasOpen = (await read($, panel)).isOpen
    if (wasOpen && !(await isPaneListed($))) await openPane($)
    return result
  })

  // Reached by the person's close mark, never by a reload.
  on('ui.close', { id: 'crew' }, async ($, ev, next) => {
    await markOpen($, false)
    return next(ev)
  })

  // Bare `/crew` toggles. `open` only ever opens, with the focus: right after a command
  // the composer is empty, so the pane comes forward from behind a tab with the keys.
  on('command.run', { command: 'crew' }, async ($, ev) => {
    const arg = (ev.args ?? '').trim()
    if (arg === 'bar') return { text: await showBar($) }
    if (arg === 'open') return { text: await showPane($, { focus: true }) }
    return { text: await togglePane($) }
  })

  // The main loop's turn names a flow no one reports, and its end may close one.
  on('turn.start', async ($, ev, next) => {
    // A turn without a prompt of its own (a continuation, a notification) clears the
    // name: an older prompt would title the wrong work.
    const prompt = promptTitle(ev.text)
    await update($, turn, () => ({ isActive: true, prompt }))
    return next(ev)
  })

  on('tool.call', { tool: 'mcp__crab-crew__progress' }, async ($, ev) => {
    // The flow belongs to the main session. A call made inside a subagent's loop has an
    // agentId and is turned down, so no worker can retitle, close or restart the flow.
    if (ev.agentId) return ignored('flow reports come from the main session')
    const input = progressInput(ev)
    if (isNewFlow(await read($, flow), input)) {
      await keepRunning($)
      await forgetFlowOpen($)
    }
    const merged = await update($, flow, current => mergeReport(current, input))
    if (merged && input.tasks?.length) await autoOpen($, opts.autoOpen)
    const running = runningOf(await read($, agents))
    return { result: `ok: ${bandLabel(merged ?? emptyFlow(), running)}` }
  })

  // Step reports come from a subagent about itself. The call runs in that subagent's
  // loop, so `agentId` identifies the row to update.
  on('tool.call', { tool: 'mcp__crab-crew__step' }, async ($, ev) => {
    const input = stepInput(ev)
    const worker = ev.agentId
    if (!worker) return ignored('step reports come from subagents')
    let found = false
    await update($, agents, runs => {
      const changed = withRun(runs, worker, a => applyStep(a, input))
      found = changed.matched
      return changed.list
    })
    return found ? { result: 'ok' } : ignored(`agent ${worker} has no row in the panel`)
  })

  on('agent.spawn', async ($, ev, next) => {
    // Briefed on step reports unless the option is off, the agent ships in a plugin
    // (`name:agent`) or the prompt already names the tool.
    const needsBrief = opts.stepReports !== 'off' && !ev.subagentType.includes(':') && !ev.prompt.includes(STEP_TOOL)
    const launched = await next(needsBrief ? { ...ev, prompt: `${ev.prompt}${STEP_BRIEF}` } : ev)
    if (launched.deny !== undefined) return launched

    // With no flow open, this agent starts one, named after the turn's prompt.
    const current = await read($, flow)
    if (!current || current.isFinished) {
      const { prompt } = await read($, turn)
      await keepRunning($)
      await update($, flow, () => autoFlow(prompt))
      await forgetFlowOpen($)
    }

    const spawnedAt = await $.clock.now()
    const spawned = { id: launched.agentId ?? ev.tool_use_id, agentId: launched.agentId, type: ev.subagentType, description: ev.description, model: launched.model }
    await update($, agents, runs => addRun(runs, spawned, spawnedAt))
    await update($, now, () => spawnedAt)
    await autoOpen($, opts.autoOpen)
    return launched
  })

  // Every model request a worker makes updates its row: context, tokens, money.
  on('turn.step', async function* ($, ev, next) {
    const out = yield* next(ev)
    const worker = ev.agentId
    const { usage } = out
    if (!worker || !usage) return out
    const model = usage.model || ev.model
    await update($, agents, runs => withRun(runs, worker, a => applyUsage(a, usage, model, ev.effort)).list)
    return out
  })

  on('turn.complete', async ($, ev, next) => {
    const worker = ev.agentId
    const endedAt = await $.clock.now()
    if (!worker) {
      await update($, turn, t => ({ ...t, isActive: false }))
    } else {
      await update($, agents, runs => withRun(runs, worker, a => finishRun(a, ev.reason, endedAt, ev.usage)).list)
      await update($, now, () => endedAt)
    }
    await settle($)
    return next(ev)
  })

  paneHooks(on, opts)
  bandHooks(on, opts)
  // band.tsx draws the crew count; pressing it toggles the pane, and the pane helpers
  // take `$`, so the hook lives here.
  on('ui.press', { element: 'crew-open' }, async ($, ev, next) => {
    if (ev.plugin === 'crab-crew') await togglePane($)
    return next(ev)
  })
}

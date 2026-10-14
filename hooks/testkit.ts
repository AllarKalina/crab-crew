import type { On, RenderSurface } from 'claude-code'
import { mock, type Engine } from 'claude-code/testing'

import type { ProgressInput, StepInput } from '../types'
import type { Usage } from './cost'
import type { BarState } from './term-bar'

// Shared test plumbing: a stand-in for the host under the mod, the moves a test
// makes on it, and the props of the two places the mod draws. Host events carry
// many fields; each helper fills in the ones nobody asserts on, so tests stay short.
export const PLUGIN = 'crab-crew'
export const PROGRESS = 'mcp__crab-crew__progress'
export const STEP = 'mcp__crab-crew__step'
// The two surfaces every drawing test runs on.
export const SURFACES = ['terminal', 'desktop'] as const satisfies readonly RenderSurface[]
const REPO = '/repo'
const HOST_MODEL = 'claude-opus-5-5'
const viewport = (bodyRows: number) => ({ scroll: { offset: 0, bodyRows }, view: {} })
export const band = { bodyColumns: 100, maxRows: 4, isWorking: false, hasSurvey: false, ...viewport(4) }
export const pane = { placement: 'dock', bodyColumns: 60, title: '', isFocused: false, ...viewport(30) } as const

type Spawn = { id: string; type: string; description: string; prompt?: string }
type Host = { model?: string; briefs?: string[]; opened?: string[] }

// The host as the mod meets it: a fake clock (returned), panes that always place,
// and subagents that start on `model`. Each brief the host is handed lands in
// `briefs`, each pane it is asked to open in `opened`.
export const engine = (on: On, { model = HOST_MODEL, briefs = [], opened = [] }: Host = {}) => {
  const clock = mock.clock(on)
  const silent = () => ({ text: '' }) as never
  const placed = { value: { isPlaced: true as const } }
  on('ui.open', (_$, request) => {
    opened.push(request.id)
    return placed
  })
  on('turn.start', (_$, { turnId }) => ({ turnId }))
  on('turn.complete', silent)
  on('agent.spawn', (_$, call) => {
    briefs.push(call.prompt)
    return { agentId: call.tool_use_id, model }
  })
  return clock
}

// The usual host, plus the list of pane ids it was asked to open, oldest first.
export const openLog = (on: On, model?: string): string[] => {
  const log = new Array<string>()
  engine(on, { opened: log, model })
  return log
}

// Every model request the host runs answers at once, billed `usage`; `null` bills nothing.
export const answerAll = (on: On, usage: (Usage & { model: string }) | null) => {
  const reply = { index: 0, turnId: 'turn', usage, stopReason: 'end_turn', toolUses: [], answer: '' }
  on('turn.step', async function* oneShot() {
    return reply as never
  })
}

// The crew pane as `$.ui.panes()` lists it: drawn and in front unless a test says not.
type ListedPane = { id: string; isPlaced: boolean; isShown: boolean }
export const crewPane = (more: Partial<ListedPane> = {}): ListedPane => ({ id: 'crew', isPlaced: true, isShown: true, ...more })

// Everything `session.start` waits on under the mod: the host's own start, the
// tool and command registrations, the pane listing (empty unless `panes` says
// otherwise), and each blit, collected into `blits`.
export const boot = (on: On, { panes = (): ListedPane[] => [], blits = [] as unknown[] } = {}) => {
  const accept = () => ({ value: undefined }) as never
  const inRepo = async () => ({ cwd: REPO }) as never
  on('session.start', inRepo)
  on('tool.register', accept)
  on('command.register', accept)
  on('ui.panes', () => ({ value: panes().map(listed => ({ isFocused: false, title: 'Crew', ...listed })) }) as never)
  on('ui.blit', (_$, drawn) => {
    blits.push(drawn)
    return { value: {} } as never
  })
}

export const startSession = ($: Engine) => $.session.start({ cwd: REPO, source: 'startup', isInteractive: true, surface: 'terminal' } as never)

export const spawn = ($: Engine, s: Spawn) =>
  $.agent.spawn({
    subagentType: s.type,
    tool_use_id: s.id,
    description: s.description,
    prompt: s.prompt ?? 'p',
    parentModel: HOST_MODEL,
    provider: 'engine',
    fork: false,
    background: false,
  } as never)

// The host's event calls want whole events; these take the loose ones tests build.
type Fire<R> = (event: Record<string, unknown>) => R
const fire = <R = Promise<unknown>>(call: unknown) => call as Fire<R>

// Ends a turn: subagent `agentId`'s, or the main loop's when it is left out. Any
// `reason` but `answer` fails the run; `usage` is what the whole turn added up to.
export const complete = ($: Engine, agentId?: string, more: { reason?: string; usage?: Usage & { model?: string } } = {}) =>
  fire($.turn.complete)({ turnId: 't', agentId, answer: 'ok', reason: 'answer', isAborted: false, durationMs: 1, ...more })

// Runs one model request of subagent `agentId` through `turn.step` to its end.
export const modelStep = async ($: Engine, agentId: string, model: string) => {
  const replies = fire<AsyncIterable<unknown>>($.turn.step)({ agentId, model, turnId: 'turn', index: 0, messageCount: 1 })
  const reader = replies[Symbol.asyncIterator]()
  while (!(await reader.next()).done);
}

export const turnStart = ($: Engine, text: string) => fire($.turn.start)({ turnId: 't', text })

// The tools take what the model sends, schema or not: anything goes in a test.
type Loose<T> = { [K in keyof T]?: T[K] | unknown } & Record<string, unknown>

// Calls the `progress` tool, from a subagent when `agentId` is in the input.
export const report = ($: Engine, input: Loose<ProgressInput>) => $.tool.call({ tool: PROGRESS, ...input } as never) as Promise<{ result?: unknown }>

// Calls the `step` tool as subagent `agentId`; `undefined` calls it from the main loop.
export const step = ($: Engine, agentId: string | undefined, input: Loose<StepInput>) =>
  $.tool.call({ tool: STEP, agentId, ...input } as never) as Promise<{ result?: unknown }>

export const crew = ($: Engine, args = '') => ($.command.run as (e: unknown) => Promise<{ text?: string } | undefined>)({ command: 'crew', args, origin: 'person' })

export const mountPane = ($: Engine, surface: RenderSurface = 'terminal', props: { bodyColumns?: number; scroll?: { offset: number; bodyRows: number } } = {}) =>
  $.ui.mount({ component: 'Pane', requestId: 'crew', plugin: PLUGIN, surface, props: { ...pane, ...props } })

export const mountBand = ($: Engine, surface: RenderSurface = 'terminal', bodyColumns = band.bodyColumns, requestId?: string) =>
  $.ui.mount({ component: 'AbovePrompt', plugin: PLUGIN, surface, props: { ...band, bodyColumns }, ...(requestId ? { requestId } : {}) })

// Every SVG a drawing holds, as one string.
export const svgOf = async (ui: { findAll(q: { type: string }): Promise<{ props: Record<string, unknown> }[]> }) => {
  const drawings = await ui.findAll({ type: 'Svg' })
  return drawings.reduce((all, node) => all + String(node.props.source), '')
}

// How many of the terminal band's texts match `pattern`, read from a fresh mount.
export const bandText = async ($: Engine, pattern: RegExp) => {
  const drawn = await mountBand($)
  const { length } = await drawn.findAll({ type: 'Text', text: pattern })
  await drawn.unmount()
  return length
}

// A 56-column bar at 1 of 8: a pill of 12, a track of 44, a task boundary on cell 2.
export const bar = (state: Partial<BarState> = {}): BarState => ({
  columns: 56,
  ratio: 1 / 8,
  isFinished: false,
  glyphs: 'nerd',
  label: 'Tasks 1/8',
  total: 8,
  done: 1,
  isWalking: true,
  hurryUntil: 0,
  ...state,
})

// A Raster's cells, decoded: u32 triplets [codePoint, foreground, background], in the
// byte order `pack` wrote them in.
export const decode = (cells: string): number[][] => {
  const words = new Uint32Array((Uint8Array as unknown as { fromBase64(s: string): Uint8Array }).fromBase64(cells).buffer)
  const out: number[][] = []
  for (let i = 0; i < words.length; i += 3) out.push([words[i]!, words[i + 1]!, words[i + 2]!])
  return out
}

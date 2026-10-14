import type { AgentRun, StepInput } from '../types'
import { costOf, usageSum, windowOf } from './cost'
import type { Usage } from './cost'
import { modelName, normTitle } from './format'
import { bareType, isGeneric, roleOf } from './roles'

// The list behind the panel: one run per subagent spawned this session, oldest first.
// Pure: register.tsx reads and writes the list, these say what changes.

// How many runs the panel remembers; the oldest go first.
const MAX_RUNS = 200

type Spawned = { id: string; agentId?: string; type: string; description: string; model: string }

// A just-spawned agent, running and not yet billed. A task handed out again is its
// next round: the round counts the runs before it under the same title.
export const addRun = (list: AgentRun[], s: Spawned, at: number): AgentRun[] => {
  const title = normTitle(s.description)
  const earlier = s.description ? list.filter(a => normTitle(a.description) === title).length : 0
  const fresh: AgentRun = {
    ...s,
    status: 'running',
    startedAt: at,
    contextTokens: 0,
    ...onModel(s.model),
    tokens: 0,
    costUsd: 0,
    steps: 0,
    round: earlier + 1,
  }
  // A re-sent id replaces its row and moves it to the end.
  const kept = list.filter(a => a.id !== s.id)
  kept.push(fresh)
  return kept.length > MAX_RUNS ? kept.slice(kept.length - MAX_RUNS) : kept
}

// `fn` applied to the rows of `agentId`; `matched` tells whether there was any.
export const withRun = (list: AgentRun[], agentId: string, fn: (a: AgentRun) => AgentRun): { list: AgentRun[]; matched: boolean } => {
  const isIt = (a: AgentRun) => a.agentId === agentId
  return { list: list.map(a => (isIt(a) ? fn(a) : a)), matched: list.some(isIt) }
}

const whole = (n: number): number => Math.max(0, Math.round(n))

// The worker's own count of its steps. With a total, done stops there.
export const applyStep = (a: AgentRun, input: StepInput): AgentRun => {
  const total = whole(input.total ?? a.stepTotal ?? 0)
  const done = whole(input.done ?? a.stepDone ?? 0)
  return { ...a, stepTotal: total, stepDone: total > 0 ? Math.min(done, total) : done, stepNote: input.note }
}

// The model a run is on, and the context window that comes with it.
const onModel = (model: string) => ({ model, contextMax: windowOf(model) })

// What a request, or a whole turn, adds to the bill.
const bill = (model: string, usage: Usage, isRequest: boolean) => ({ tokens: usageSum(usage), costUsd: costOf(model, usage, isRequest) })

// One model request: what it sent and got back fills the context now; tokens and
// money add to what the run already spent. Any request means the run is alive.
export const applyUsage = (a: AgentRun, usage: Usage, model: string, effort: unknown): AgentRun => {
  const request = bill(model, usage, true)
  return {
    ...a,
    ...onModel(model),
    effort: typeof effort === 'string' ? effort : a.effort,
    status: 'running',
    endedAt: undefined,
    contextTokens: request.tokens,
    tokens: a.tokens + request.tokens,
    costUsd: a.costUsd + request.costUsd,
    steps: a.steps + 1,
  }
}

// The turn is over: done on an answer, failed on anything else. Seen requests
// already billed the run; with none seen, the turn's total stands in, at the plain rate.
export const finishRun = (a: AgentRun, reason: string, at: number, usage?: Usage & { model?: string }): AgentRun => {
  const ended: AgentRun = { ...a, status: reason === 'answer' ? 'done' : 'failed', endedAt: at }
  if (a.steps > 0 || !usage) return ended
  const model = usage.model || a.model
  return { ...ended, model, ...bill(model, usage, false) }
}

// What the panel shows of a run, on either surface.

export const elapsed = (a: AgentRun, at: number): number => {
  const end = a.endedAt ?? Math.max(at, a.startedAt)
  return end - a.startedAt
}

// Share of the task done, from the worker's step count; null when it gave none.
// A finished run counts as whole whatever it reported.
export const progressOf = (a: AgentRun): number | null =>
  a.status === 'done' ? 1 : a.stepTotal ? Math.min(1, (a.stepDone ?? 0) / a.stepTotal) : null

// Context fill in whole percent, never past 100.
export const ctxOf = (a: AgentRun): number => {
  if (!a.contextMax) return 0
  const pct = (a.contextTokens / a.contextMax) * 100
  return Math.min(100, Math.round(pct))
}

// Model, then the effort when one was reported.
const runModel = (a: AgentRun): string => [modelName(a.model), a.effort].filter(Boolean).join(' · ')

// What follows the role word: the agent type when it says more than the role (a generic
// type never does: the role, read from the task, already names the job), then the model.
export const metaOf = (a: AgentRun): string[] => {
  const role = roleOf(a.type, a.description)
  const type = bareType(a.type)
  const typeSaysMore = type.toLowerCase() !== role && !isGeneric(type)
  const parts = [typeSaysMore && type, runModel(a), a.round > 1 && `round ${a.round}`, a.status === 'failed' && 'error']
  return parts.filter((p): p is string => typeof p === 'string')
}

// The step line, the same on every surface: `3/5 note`, one space between, as a
// terminal row has little room; the count alone, or the note alone when the worker
// reported a note but no total.
export const stepsOf = (a: AgentRun): string => [a.stepTotal ? [a.stepDone ?? 0, a.stepTotal].join('/') : '', a.stepNote ?? ''].filter(Boolean).join(' ')

// A run's status in the terminal panel, and a planned task's.
export const STATUS_GLYPH: Record<AgentRun['status'] | 'planned', string> = {
  running: '●',
  done: '✓',
  failed: '✗',
  planned: '◷',
}

import type { AgentRun, Flow, Phase, PlannedTask, ProgressInput, StepInput } from '../types'
import { clip, normTitle } from './format'
import { roleName } from './roles'

export const PHASES: readonly Phase[] = ['plan', 'design', 'delegate', 'review', 'close']
// Upper bounds on what one call can store. The schema is only a suggestion to the
// model, so oversized input is cut here before it reaches the band or the panel.
const LIMIT = { tasks: 200, after: 20, title: 120 } as const
const AUTO_TITLE = 48
const MAX_NOTE = 80

// The input as sent, schema or not: what is not a string, a finite number or a list
// where one belongs is left out, as if never sent. A count may come as a numeric
// string (`"3"`), as models send now and then; any other string is left out.
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {})
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.trim()) : Number.NaN)
const count = (v: unknown): number | undefined => {
  const n = num(v)
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : undefined
}
const list = (v: unknown): unknown[] | undefined => (Array.isArray(v) ? v : undefined)

// A `progress` call's input, each field its own type or left out.
export const progressInput = (e: unknown): ProgressInput => {
  const o = obj(e)
  return {
    title: str(o.title),
    total: count(o.total),
    done: count(o.done),
    phase: PHASES.find(p => p === o.phase),
    finished: typeof o.finished === 'boolean' ? o.finished : undefined,
    tasks: list(o.tasks)?.map(t => {
      const task = obj(t)
      return { title: str(task.title), role: str(task.role), after: list(task.after)?.filter((n): n is number => typeof n === 'number') }
    }),
  }
}

// A `step` call's input; the note is a few words, cut to a line.
export const stepInput = (e: unknown): StepInput => {
  const o = obj(e)
  const note = str(o.note)?.trim()
  return { done: count(o.done), total: count(o.total), note: note ? clip(note, MAX_NOTE) : undefined }
}

export const emptyFlow = (): Flow => ({
  title: 'Subagents',
  total: 0,
  done: 0,
  phase: 'plan',
  isFinished: false,
  isAuto: false,
  isHidden: false,
  tasks: [],
})

// The first line of the prompt names a flow nobody reported; a command or a
// notification is not a name.
export const promptTitle = (text: string): string => {
  const line = text.trim().split('\n')[0]?.trim() ?? ''
  return /^[</[]/.test(line) ? '' : clip(line, AUTO_TITLE)
}

export const autoFlow = (prompt: string): Flow => ({ ...emptyFlow(), title: prompt || 'Subagents', phase: 'delegate', isAuto: true })

// A flow the mod started by itself is taken over by the first report, runs and all.
// A reported flow is replaced only by a report under another title.
export const isNewFlow = (prev: Flow | null, input: ProgressInput): boolean => {
  if (!prev || prev.isFinished) return true
  if (prev.isAuto || input.title === undefined) return false
  return clip(input.title.trim(), LIMIT.title) !== prev.title
}

// Task numbers a task waits on: whole and from 1, at most LIMIT.after of them.
const waitsOn = (after: number[] | undefined): number[] => (after ?? []).filter(n => n > 0 && Number.isInteger(n)).slice(0, LIMIT.after)

// The plan as the panel keeps it; undefined when the report sent none, so the old one stands.
const planOf = (sent: ProgressInput['tasks']): PlannedTask[] | undefined => {
  if (!sent) return undefined
  const plan: PlannedTask[] = []
  for (const t of sent) {
    if (plan.length === LIMIT.tasks) break
    const title = t.title?.trim()
    if (title) plan.push({ title, role: roleName(t.role ?? ''), after: waitsOn(t.after) })
  }
  return plan
}

// A whole number from 0 to `max`.
const within = (n: number, max: number): number => Math.min(max, Math.max(0, Math.round(n)))

export const mergeReport = (prev: Flow | null, input: ProgressInput): Flow => {
  // Counters belong to one flow: a new one starts from the empty flow, not the last.
  const base: Flow = prev && !isNewFlow(prev, input) ? { ...emptyFlow(), ...prev } : emptyFlow()
  const tasks = planOf(input.tasks) ?? base.tasks
  // A plan without a count is counted by its length.
  const planned = input.tasks ? tasks.length : base.total
  const total = within(input.total ?? planned, LIMIT.tasks)
  const isFinished = input.finished === true
  const title = clip(input.title?.trim() || base.title, LIMIT.title)
  return {
    ...base,
    title,
    total,
    // Done never runs past the total, when there is one.
    done: within(input.done ?? base.done, total || Infinity),
    // `progressInput` lets through only a phase of PHASES.
    phase: isFinished ? 'close' : (input.phase ?? base.phase),
    isFinished,
    isAuto: false,
    tasks,
  }
}

export const runningOf = (list: AgentRun[]): number => list.filter(a => a.status === 'running').length

// An auto flow counts the panel's own runs: every spawned agent is a task, every ended one is done.
export const withLiveCounts = (f: Flow, list: AgentRun[]): Flow =>
  f.isAuto ? { ...f, total: list.length, done: list.length - runningOf(list) } : f

// Planning and design have no count to show yet.
const UNCOUNTED: Partial<Record<Phase, string>> = { plan: 'Plan', design: 'Design' }

export const bandLabel = (f: Flow, running: number): string => {
  if (f.isFinished) return 'Done'
  const word = UNCOUNTED[f.phase]
  if (word) return word
  const tally = f.total ? `${f.done}/${f.total}` : `${running} running`
  return (f.phase === 'review' ? 'Review ' : 'Tasks ') + tally
}

export const ratio = (f: Flow): number => {
  if (f.isFinished) return 1
  return f.total ? f.done / f.total : 0
}

// A planned task is matched to its run by title, as the reader sees it: case and
// punctuation aside.
export type Planned = PlannedTask & { n: number }

export const plannedOf = (f: Flow | null, list: AgentRun[]): Planned[] => {
  const open = f && !f.isFinished ? (f.tasks ?? []) : []
  const handedOut = new Set(list.map(a => normTitle(a.description)))
  return open.flatMap((t, i) => (handedOut.has(normTitle(t.title)) ? [] : [{ ...t, n: i + 1 }]))
}

// The panel's header: money and tokens of every run, and the time from the first
// start to the last end (or now, while one runs).
export const totals = (list: AgentRun[], at: number) => {
  let cost = 0
  let tokens = 0
  let first = Infinity
  let last = -Infinity
  for (const a of list) {
    cost += a.costUsd
    tokens += a.tokens
    first = Math.min(first, a.startedAt)
    last = Math.max(last, a.endedAt ?? Math.max(at, a.startedAt))
  }
  return { cost, tokens, time: list.length ? last - first : 0 }
}

export type Totals = ReturnType<typeof totals>

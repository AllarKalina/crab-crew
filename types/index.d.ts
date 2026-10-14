/**
 * Shapes shared by the hooks, plus what crab-crew adds to Claude Code's own typings:
 * its stored state and the input of its two tools.
 */

/** Where a coordinated job stands, as the main session reports it. */
export type Phase =
  | 'plan'
  | 'design'
  | 'delegate'
  | 'review'
  | 'close'

/** The trade a subagent's work falls under; sets the crab's outfit and colour. */
export type Role =
  | 'designer'
  | 'reviewer'
  | 'scout'
  | 'planner'
  | 'builder'
  | 'runner'
  | 'fork'
  | 'other'

/** A run is live until it ends one way or the other. */
export type AgentStatus =
  | 'running'
  | 'done'
  | 'failed'

/** One entry of the main session's plan. */
export type PlannedTask = {
  title: string
  /** Empty string when the plan gave no role, or one this mod does not know. */
  role: Role | ''
  after: number[]
}

/** The job behind the band: its title, its counts, and the plan. */
export type Flow = {
  title: string
  phase: Phase
  done: number
  total: number
  tasks: PlannedTask[]
  isFinished: boolean
  /**
   * True when no `progress` call opened it: the mod did, on a subagent's spawn, and
   * the panel's runs supply its counts.
   */
  isAuto: boolean
  /**
   * Dismissed with ✕ on the band. `/crew bar` shows it again; the next flow is
   * visible from the start.
   */
  isHidden: boolean
}

/** One subagent launch, from spawn to finish. */
export type AgentRun = {
  id: string
  agentId?: string
  round: number
  description: string
  type: string
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  steps: number
  tokens: number
  contextTokens: number
  contextMax: number
  costUsd: number
  /** The subagent's own count, sent with the `step` tool. */
  stepDone?: number
  stepTotal?: number
  stepNote?: string
}

/** The crew pane's view settings. */
export type Panel = {
  isOpen: boolean
  isCompact: boolean
  isDoneCollapsed: boolean
  /** The last thing the pane opened itself for: a session, a flow, or nothing so far. */
  autoOpenedFor: '' | 'session' | 'flow'
}

/** State of the main loop: is a turn under way, and which prompt names an auto flow. */
export type Turn = {
  isActive: boolean
  prompt: string
}

/** Arguments of the `progress` tool, sent by the main session. */
export type ProgressInput = {
  title?: string
  phase?: Phase
  tasks?: { title?: string; role?: string; after?: number[] }[]
  done?: number
  total?: number
  finished?: boolean
}

/** Arguments of the `step` tool, sent by a subagent about itself. */
export type StepInput = {
  done?: number
  total?: number
  note?: string
}

declare module 'claude-code' {
  /** Typing the tool inputs lets a `tool.call` matcher name these tools and gives `e` the right input type. */
  interface McpToolInputs {
    'mcp__crab-crew__progress': ProgressInput
    'mcp__crab-crew__step': StepInput
  }
  /** Everything the mod stores lives under its plugin name, one key per atom. */
  interface PluginState {
    'crab-crew': {
      flow: Flow | null
      agents: AgentRun[]
      panel: Panel
      now: number
      turn: Turn
      /** The crab's current walking frame; the band redraws when it changes. */
      pose: string
    }
  }
}

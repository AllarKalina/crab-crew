import type { ToolSpec } from 'claude-code'

import { PHASES } from './flow'
import { ROLES } from './roles'

// Tool definitions the mod registers with Claude Code. Everything here is read by the
// model, so it is phrased as instructions to it. A schema only suggests what to send:
// flow.ts still clamps and filters each call before anything is drawn. The full tool
// names below also appear in register.tsx's tool.call matchers.

export const STEP_TOOL = 'mcp__crab-crew__step'

// JSON schema shorthands for the property lists below.
const text = (description: string) => ({ type: 'string', description })
const count = (minimum: number, description: string) => ({ type: 'integer', minimum, description })
const numbers = (description: string) => ({ type: 'array', items: { type: 'integer' }, description })

// Roles a planned task may name; `fork` and `other` are only ever inferred.
const plannable = ROLES.filter(r => r !== 'other' && r !== 'fork')

const progressText = [
  'For the main session alone: it feeds the progress bar over the input box and the crew panel while you coordinate',
  'work split across two or more subagent tasks.',
  'Send it once the plan is set (title, tasks, phase "delegate"), again whenever a task passes review (done),',
  'whenever the phase changes or the plan is revised (tasks), and a last time with finished: true.',
  'Any field you omit keeps the value it had.',
  'Calls made by a subagent are dropped; subagents use `step` instead.',
].join(' ')

export const PROGRESS_SPEC: ToolSpec = {
  name: 'progress',
  description: progressText,
  inputSchema: {
    type: 'object',
    properties: {
      title: text('What the whole job is called, in a handful of words.'),
      total: count(0, 'How many subagent tasks the plan has.'),
      done: count(0, 'How many of those tasks have passed review.'),
      phase: { type: 'string', enum: PHASES.slice() },
      finished: { type: 'boolean', description: 'Set to true when the job is wrapped up.' },
      tasks: {
        type: 'array',
        description:
          'Every planned subagent task, in plan order; task 1 is the first. Give each the exact text you will pass as the Agent tool `description` when delegating it: that is how the panel ties a running agent to its task.',
        items: {
          type: 'object',
          required: ['title'],
          properties: {
            title: text('Short, and identical to the Agent description used for it.'),
            role: { type: 'string', enum: plannable, description: 'The kind of work this task involves.' },
            after: numbers('Task numbers that must finish before this one starts.'),
          },
        },
      },
    },
  },
}

const stepText = [
  'Subagents only: shows how far along your own task is in the crew panel.',
  'As soon as you have read your brief, send `done: 0` with `total` set to the number of steps you plan (3 to 8);',
  'send it again each time a step is complete. It is quick and prints nothing, it just moves a bar.',
].join(' ')

export const STEP_SPEC: ToolSpec = {
  name: 'step',
  description: stepText,
  inputSchema: {
    type: 'object',
    required: ['done'],
    properties: {
      done: count(0, 'How many steps are complete.'),
      total: count(1, 'How many steps you plan; update it if the plan grows or shrinks.'),
      note: text('A few words on the step you are working on now.'),
    },
  },
}

// Appended to the prompt of a built-in subagent. Agents that come from a plugin bring
// their own tool list without this tool, so their prompts are not touched.
export const STEP_BRIEF = `

Progress reporting: when your tools include \`${STEP_TOOL}\` (if it shows up as deferred, fetch it first with ToolSearch \`select:${STEP_TOOL}\`), start by calling it with \`done: 0\` and \`total\` set to the number of steps you plan (3 to 8), before doing anything else. After each step is complete, call it again with the new \`done\` and a short \`note\`. All it does is move a progress bar.`

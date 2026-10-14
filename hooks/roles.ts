import type { Role } from '../types'
import { M, blend, hex, rgb } from './theme'

// A role is what a subagent is doing, and picks its costume and color. It is read
// from the agent type; a general-purpose agent has no trade of its own, so the
// verb its task description opens with decides.

export const ROLES: readonly Role[] = ['designer', 'reviewer', 'scout', 'planner', 'builder', 'runner', 'fork', 'other']

// Catppuccin Mocha accents, one per role.
const ROLE_COLOR: Record<Role, string> = {
  designer: M.pink,
  reviewer: M.peach,
  scout: M.green,
  planner: M.yellow,
  builder: M.blue,
  runner: M.teal,
  fork: M.lavender,
  other: M.overlay1,
}

const isRole = (v: string): v is Role => ROLES.some(r => r === v)

export const colorOf = (role: Role): string => ROLE_COLOR[role]

// The role's colour taken 40% toward Mocha's base: a row's bar while it shows the
// context, not its task's progress, in the terminal and on the desktop alike.
export const dimColorOf = (role: Role): string => hex(blend(rgb(ROLE_COLOR[role]), rgb(M.base), 0.4))

// Anything other than a listed role becomes '', since callers index the role tables with it.
export const roleName = (v: string): Role | '' => {
  const r = v.trim().toLowerCase()
  return isRole(r) ? r : ''
}

// Matched against each word of the type, whole: `planetscale-helper` plans nothing.
// Rows are tried top to bottom, so Impeccable's finish reviewer lands on reviewer, not designer.
const BY_TYPE: [RegExp, Role][] = [
  [/^(review(er)?|critic|audit(or)?|verif(y|ier))$/, 'reviewer'],
  [/^(impeccable|design(er)?|asset)$/, 'designer'],
  [/^(explorer?|research(er)?|search(er)?|scout)$/, 'scout'],
  [/^(plan(ner)?|architect)$/, 'planner'],
  [/^(tests?|tester|regress|runner)$/, 'runner'],
  [/^fork$/, 'fork'],
]

// Matched against the description's first word alone: in "Fix failing tests" the
// work is fixing, and in "Address review comments" it is addressing.
const BY_VERB: [RegExp, Role][] = [
  [/^(review|audit|critiqu|verif|inspect|assess|validat)|^check(s|ed|ing)?$/, 'reviewer'],
  [/^(design|redesign|polish|restyl|styl|sketch|mock|typeset|coloriz|animat)/, 'designer'],
  [/^(explor|research|locat|investigat|survey|discover|identif|analy[sz])|^(find|search|trac|map|read|look|list)(e|s|es|ed|ped|ing|ping)?$/, 'scout'],
  [/^(architect|outlin|propos)|^(plan|spec|scop)(e|s|es|ned|ning|ing|ify)?$/, 'planner'],
  [/^(regress|lint|typecheck|benchmark|execut)|^(run|test)(s|ning|ed|ing)?$/, 'runner'],
]

// A general-purpose agent: its type names no trade of its own.
export const isGeneric = (type: string): boolean => /^(general-purpose|claude)$/i.test(type)

const match = (table: [RegExp, Role][], words: string[]): Role | undefined =>
  table.find(([re]) => words.some(w => re.test(w)))?.[1]

const wordsOf = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

export const roleOf = (type: string, description = ''): Role => {
  const byType = match(BY_TYPE, wordsOf(type))
  if (byType) return byType
  if (!isGeneric(type)) return 'other'
  return match(BY_VERB, wordsOf(description).slice(0, 1)) ?? 'builder'
}

// `impeccable:impeccable-asset-producer` shows as `asset-producer`.
export const bareType = (type: string): string => {
  const [plugin, name] = type.includes(':') ? type.split(':', 2) : ['', type]
  return plugin && name?.startsWith(plugin + '-') ? name.slice(plugin.length + 1) : (name ?? type)
}

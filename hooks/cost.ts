// What a subagent's tokens cost. The engine counts tokens, never dollars, so every
// figure here is an estimate from list prices.

// The four kinds of token the engine reports, in the order a bill adds them up.
const KINDS = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'] as const

export type Usage = Record<(typeof KINDS)[number], number>

// Dollars per million tokens of each kind. Cache writes come as one count, lifetimes
// unsplit, so they take the 1-hour price (twice input): what a subscription writes.
type Rate = Usage

const rate = (input: number, output: number, cacheRead: number, cacheWrite: number): Rate => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheWrite,
})

const OPUS_5_5 = rate(4, 20, 0.2, 8)

// A family is known by any of its names; a release priced apart from the family is
// listed under it, the longer version first so `5-5` is tried before `5`. Families
// are tried in this order, and an id no family claims is billed as Opus 5.5.
type Family = { names: string[]; rate: Rate; releases: [version: string, rate: Rate][] }

const FAMILIES: Family[] = [
  { names: ['fable', 'mythos'], rate: rate(10, 50, 1, 20), releases: [['5-1', rate(10, 50, 0.25, 20)]] },
  { names: ['opus'], rate: rate(5, 25, 0.5, 10), releases: [['5-5', OPUS_5_5]] },
  {
    names: ['sonnet'],
    rate: rate(3, 15, 0.3, 6),
    releases: [
      ['5-5', rate(2, 10, 0.1, 4)],
      ['5', rate(2, 10, 0.2, 4)],
    ],
  },
  { names: ['haiku'], rate: rate(1, 5, 0.1, 2), releases: [['5-5', rate(0.1, 0.5, 0.01, 0.2)]] },
]

// Haiku 5.5 charges more once a single request's prompt (everything but the output)
// passes 100K tokens. Checked before the families, as it overrides them.
const LONG_PROMPT = { release: 'haiku-5-5', over: 100_000, rate: rate(0.5, 2.5, 0.05, 1) }

const rateFor = (model: string, prompt: number): Rate => {
  const lower = model.toLowerCase()
  if (prompt > LONG_PROMPT.over && lower.includes(LONG_PROMPT.release)) return LONG_PROMPT.rate
  const family = FAMILIES.find(fam => fam.names.some(name => lower.includes(name)))
  if (!family) return OPUS_5_5
  const release = family.releases.find(([version]) => family.names.some(name => lower.includes(`${name}-${version}`)))
  return release ? release[1] : family.rate
}

const tally = (u: Usage, weight: (kind: keyof Usage) => number): number =>
  KINDS.reduce((sum, kind) => sum + (u[kind] || 0) * weight(kind), 0)

// Tokens of every kind together: one request's, or a whole turn's.
export const usageSum = (u: Usage): number => tally(u, () => 1)

// Only one request has a prompt length to price by (`isRequest`); a whole turn's
// sum is billed at the plain rate.
export const costOf = (model: string, u: Usage, isRequest: boolean): number => {
  const prompt = isRequest ? usageSum(u) - (u.output_tokens || 0) : 0
  const r = rateFor(model, prompt)
  return tally(u, kind => r[kind]) / 1e6
}

// Context window: 200K on Haiku 4 and every Claude 3 model, 1M on all else.
const SMALL_WINDOW = ['haiku-4', 'claude-3']

export const windowOf = (model: string): number => (SMALL_WINDOW.some(s => model.toLowerCase().includes(s)) ? 200_000 : 1_000_000)

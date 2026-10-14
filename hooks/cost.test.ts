import { test, expect, type Engine } from 'claude-code/testing'

import { costOf, windowOf, type Usage } from './cost'
import { answerAll, complete, engine, modelStep, mountPane, spawn } from './testkit'

// Published list prices in dollars per million tokens, four per model: input, output,
// cache read, then cache write. The host reports cache writes as one count, so the 1-hour write price
// (twice the input price) is the one that applies.
const LIST_PRICE: Record<string, readonly [number, number, number, number]> = {
  'claude-haiku-4-5': [1, 5, 0.1, 2],
  'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.2],
  'claude-sonnet-4-6': [3, 15, 0.3, 6],
  'claude-sonnet-5': [2, 10, 0.2, 4],
  'claude-sonnet-5-5': [2, 10, 0.1, 4],
  'claude-opus-4-8': [5, 25, 0.5, 10],
  'claude-opus-5': [5, 25, 0.5, 10],
  'claude-opus-5-5': [4, 20, 0.2, 8],
  'claude-mythos-5': [10, 50, 1, 20],
  'claude-fable-5': [10, 50, 1, 20],
  'claude-fable-5-1': [10, 50, 0.25, 20],
  // A model the table has never heard of is estimated as Opus 5.5.
  'gpt-something': [4, 20, 0.2, 8],
}

const KIND_ORDER = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'] as const
const usage = (input: number, output: number, cacheRead: number, cacheWrite: number): Usage => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheWrite,
})

test('price: a million tokens of each kind costs exactly its list price, model by model', () => {
  for (const [model, prices] of Object.entries(LIST_PRICE))
    KIND_ORDER.forEach((kind, i) => {
      const million = { ...usage(0, 0, 0, 0), [kind]: 1e6 }
      expect(`${model} ${kind}: ${costOf(model, million, false).toFixed(4)}`).toBe(`${model} ${kind}: ${prices[i]!.toFixed(4)}`)
    })
})

// Haiku 5.5 bills a single request by its prompt (all but the output): past 100k it
// pays 0.50 / 2.50 / 0.05 / 1.00 instead of 0.10 / 0.50 / 0.01 / 0.20.
test('price: Haiku 5.5 switches to its long-prompt rate only once one request\'s prompt passes 100k tokens', () => {
  // Six decimals: a millionth of a dollar is the smallest step a token count can make here.
  const dollars = (model: string, u: Usage, isRequest: boolean) => costOf(model, u, isRequest).toFixed(6)
  const atLine = usage(40_000, 1e6, 60_000, 0)
  const pastLine = usage(41_000, 1e6, 60_000, 0)
  // 40k·0.10 + 1M·0.50 + 60k·0.01, then 41k·0.50 + 1M·2.50 + 60k·0.05, per million.
  expect(dollars('claude-haiku-5-5', atLine, true)).toBe('0.504600')
  expect(dollars('claude-haiku-5-5', pastLine, true)).toBe('2.523500')
  // A turn's total is no single request, so its size never moves it off the base rate.
  expect(dollars('claude-haiku-5-5', usage(5e6, 0, 0, 0), false)).toBe('0.500000')
  // Other releases have one rate whatever the prompt.
  expect(dollars('claude-haiku-4-5', pastLine, true)).toBe(dollars('claude-haiku-4-5', pastLine, false))
  expect(dollars('claude-haiku-4-5', pastLine, true)).toBe('5.047000')
})

test('context window: 200k for Haiku 4 and Claude 3 models, 1M for the rest', () => {
  const windows = Object.fromEntries(['claude-haiku-4-5', 'claude-3-7-sonnet', 'claude-haiku-5-5', 'claude-opus-5', 'claude-sonnet-4-6'].map(m => [m, windowOf(m)]))
  expect(windows).toEqual({
    'claude-haiku-4-5': 200_000,
    'claude-3-7-sonnet': 200_000,
    'claude-haiku-5-5': 1_000_000,
    'claude-opus-5': 1_000_000,
    'claude-sonnet-4-6': 1_000_000,
  })
})

// Subagent `a1` running on `model`; each request it makes bills `request`, if given.
type Hook = Parameters<typeof engine>[0]
const hire = async ($: Engine, on: Hook, { model, request }: { model: string; request?: Usage }) => {
  engine(on, { model })
  if (request) answerAll(on, { ...request, model })
  await spawn($, { id: 'a1', type: 'general-purpose', description: 'Estimate the bill' })
}
const paneText = async ($: Engine, text: RegExp) => (await mountPane($)).find({ type: 'Text', text })

// With no request on record, the bill falls back to the turn total at turn end: 3M input,
// 400k output, 10M cache read and 500k cache write, i.e. 3·in + 0.4·out + 10·read + 0.5·write.
const WHOLE_TURN = usage(3e6, 4e5, 1e7, 5e5)
const TURN_BILL: { model: string; reads: string }[] = [
  { model: 'claude-haiku-4-5', reads: '$7.00' }, // 3 + 2 + 1 + 1
  // 0.3 + 0.2 + 0.1 + 0.1: 13.5M of prompt, yet a turn's sum stays on the base rate.
  { model: 'claude-haiku-5-5', reads: '$0.70' },
  { model: 'claude-sonnet-4-6', reads: '$21.0' }, // 9 + 6 + 3 + 3
  { model: 'claude-sonnet-5', reads: '$14.0' }, // 6 + 4 + 2 + 2
  { model: 'claude-sonnet-5-5', reads: '$13.0' }, // 6 + 4 + 1 + 2
  { model: 'claude-opus-4-8', reads: '$35.0' }, // the Opus family rate
  { model: 'claude-opus-5', reads: '$35.0' }, // 15 + 10 + 5 + 5
  { model: 'claude-opus-5-5', reads: '$26.0' }, // 12 + 8 + 2 + 4
  { model: 'claude-fable-5', reads: '$70.0' }, // 30 + 20 + 10 + 10
  { model: 'claude-fable-5-1', reads: '$62.5' }, // 30 + 20 + 2.5 + 10
]

for (const { model, reads } of TURN_BILL)
  test(`pane: a ${model} run billed only at its end reads ≈${reads}`, async ($, on) => {
    await hire($, on, { model })
    await complete($, 'a1', { usage: { ...WHOLE_TURN, model } })
    expect(await paneText($, new RegExp(`≈\\${reads}$`))).toBeDefined()
  })

// One request of 30k input, 10k output, 60k cache read and 20k cache write: a 110k
// prompt, over Haiku 5.5's line, and 120k tokens of context.
const BIG_REQUEST = usage(30_000, 10_000, 60_000, 20_000)
const REQUEST_ROW = [
  // Long-prompt rate: 15k + 25k + 3k + 20k micro-dollars = $0.063 (the base rate gives $0.0126).
  { model: 'claude-haiku-5-5', stats: 'ctx 12% · 120k · ≈$0.06' },
  // One rate: 30k + 50k + 6k + 40k micro-dollars = $0.126, against a 200k window.
  { model: 'claude-haiku-4-5', stats: 'ctx 60% · 120k · ≈$0.13' },
] as const

for (const { model, stats } of REQUEST_ROW)
  test(`pane: one big ${model} request reads "${stats}"`, async ($, on) => {
    await hire($, on, { model, request: BIG_REQUEST })
    await modelStep($, 'a1', model)
    const line = await paneText($, /^ctx /)
    expect(line?.text).toBe(stats)
  })

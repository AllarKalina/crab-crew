import { expect, test } from 'claude-code/testing'

import type { AgentRun } from '../types'
import { addRun, applyStep, applyUsage, finishRun, withRun } from './runs'
import { complete, engine, mountPane, spawn, svgOf, turnStart } from './testkit'

const spawned = (id: string, description = 'Find the login tests') => ({ id, agentId: id, type: 'Explore', description, model: 'claude-opus-5-5' })
const run = (over: Partial<AgentRun> = {}): AgentRun => ({ ...addRun([], spawned('a1'), 0)[0]!, ...over })
const TURN = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 3000, cache_creation_input_tokens: 800 }

test('runs: a task handed out again is its next round, whatever its case and punctuation', () => {
  let list = addRun([], spawned('a1'), 0)
  list = addRun(list, spawned('a2', 'find the login tests!'), 1)
  list = addRun(list, spawned('a3', 'Wire the fix'), 2)
  expect(list.map(a => a.round)).toEqual([1, 2, 1])
  // A run with no description is no one's second round.
  expect(addRun(addRun([], spawned('b1', ''), 0), spawned('b2', ''), 1).map(a => a.round)).toEqual([1, 1])
})

test('runs: the panel keeps the last 200, the oldest falling off', () => {
  let list: AgentRun[] = []
  for (let i = 0; i < 205; i++) list = addRun(list, spawned(`a${i}`, `Task ${i}`), i)
  expect(list.length).toBe(200)
  expect(list[0]?.id).toBe('a5')
  expect(list.at(-1)?.id).toBe('a204')
})

test('runs: a step report is held at its total, and keeps what it leaves out', () => {
  expect(applyStep(run(), { done: 9, total: 4 })).toMatchObject({ stepDone: 4, stepTotal: 4 })
  expect(applyStep(run({ stepTotal: 5, stepDone: 1 }), { done: 2 })).toMatchObject({ stepDone: 2, stepTotal: 5 })
  // No total yet: the count stands on its own.
  expect(applyStep(run(), { done: 3 })).toMatchObject({ stepDone: 3, stepTotal: 0 })
  expect(withRun([run()], 'nobody', a => applyStep(a, { done: 1 })).matched).toBe(false)
})

test('runs: each request sets the live context and adds to tokens and cost', () => {
  const once = applyUsage(run(), TURN, 'claude-haiku-4-5', 'low')
  const twice = applyUsage(once, TURN, 'claude-haiku-4-5', undefined)
  expect(once).toMatchObject({ contextTokens: 5000, contextMax: 200_000, tokens: 5000, steps: 1, effort: 'low' })
  expect(twice).toMatchObject({ contextTokens: 5000, tokens: 10_000, steps: 2, effort: 'low' })
  expect(Math.abs(twice.costUsd - once.costUsd * 2)).toBeLessThan(1e-12)
})

test('runs: a turn that ends without an answer failed; one with unseen steps is priced from its sum', () => {
  expect(finishRun(run(), 'error', 5)).toMatchObject({ status: 'failed', endedAt: 5 })
  expect(finishRun(run(), 'answer', 5)).toMatchObject({ status: 'done', endedAt: 5, tokens: 0 })
  const priced = finishRun(run(), 'answer', 5, { model: 'claude-sonnet-4-6', ...TURN })
  expect(priced).toMatchObject({ model: 'claude-sonnet-4-6', tokens: 5000 })
  // (1000 × 3 + 200 × 15 + 3000 × 0.30 + 800 × 6) / 1M
  expect(Math.abs(priced.costUsd - 0.0117)).toBeLessThan(1e-9)
  // Seen steps are the record: the turn's sum would count them twice.
  expect(finishRun(run({ steps: 2, tokens: 7 }), 'answer', 5, { ...TURN })).toMatchObject({ tokens: 7 })
})

test('panel: a failed run is marked so, on either surface, and a second round says so', async ($, on) => {
  engine(on)
  // The main loop works on, so the flow stays open for the retry.
  await turnStart($, 'Fix the login')
  await spawn($, { id: 'a1', type: 'general-purpose', description: 'Wire the fix' })
  await complete($, 'a1', { reason: 'error' })
  await spawn($, { id: 'a2', type: 'general-purpose', description: 'Wire the fix' })
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /^✗$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /error/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /round 2/ })).toBeDefined()
  const desk = await svgOf(await mountPane($, 'desktop'))
  expect(desk).toContain('error')
  expect(desk).toContain('round 2')
})

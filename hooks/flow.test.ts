import { test, expect } from 'claude-code/testing'

import { PHASES, progressInput } from './flow'
import { SURFACES, engine, mountBand, mountPane, openLog, report, spawn, step, svgOf } from './testkit'

// The `progress` tool's result for a call, as a plain string.
const said = async (reply: Promise<{ result?: unknown }>) => String((await reply).result)

// The crew button's label on the band: how many runs and planned tasks it counts.
const crewCount = async (ui: Awaited<ReturnType<typeof mountBand>>) => (await ui.find({ key: 'crew-open' }))?.props.label

const PORT = {
  title: 'Port the importer',
  phase: 'delegate',
  tasks: [
    { title: 'Map the old schema', role: 'scout' },
    { title: 'Rewrite the reader', role: 'builder', after: [1] },
    { title: 'Check the edge files', role: 'reviewer', after: [2] },
  ],
}

for (const surface of SURFACES) {
  test(`${surface}: a reported plan counts its tasks on the band and opens the panel just once`, async ($, on) => {
    const opened = openLog(on)
    expect(await said(report($, PORT))).toBe('ok: Tasks 0/3')

    const band = await mountBand($, surface)
    // Nothing has started yet, so the count is the three planned tasks.
    expect(await crewCount(band)).toBe('×3')

    await report($, { done: 2 })
    expect(await said(report($, { finished: true }))).toBe('ok: Done')
    expect(opened).toEqual(['crew'])
  })

  // The model is told the schema, not bound by it: prototype names for roles and far
  // more tasks than the cap must come out as a capped, ordinary drawing.
  test(`${surface}: a hostile plan is capped at 200 tasks and draws no leaked object text`, async ($, on) => {
    engine(on)
    const odd = ['__proto__', 'constructor', 'valueOf'].map(role => ({ title: `Odd ${role}`, role }))
    const flood = Array.from({ length: 300 }, (_, n) => ({ title: `Chore ${n + 1}`, role: 'runner' }))
    const reply = report($, { title: 'Flood', phase: 'delegate', tasks: [...odd, ...flood], total: Number.MAX_SAFE_INTEGER })
    expect(await said(reply)).toBe('ok: Tasks 0/200')

    expect(await crewCount(await mountBand($, surface))).toBe('×200')

    const panel = await mountPane($, surface)
    expect(await panel.find({ text: /Planned · 200/ })).not.toBeUndefined()
    const svg = await svgOf(panel)
    for (const leak of ['[object', 'native code']) expect(svg.includes(leak)).toBe(false)
  })
}

// Titles are stored cut to length, so a resent overlong title must be cut the same way
// before it is compared, or the flow would restart on every report. Only the tool's
// replies are read here, so one surface is enough.
test('progress: resending an overlong title keeps the flow, a new title starts another', async ($, on) => {
  engine(on)
  const sprawling = 'Q'.repeat(1000)
  expect(await said(report($, { title: sprawling, phase: 'delegate', total: 6, done: 3 }))).toBe('ok: Tasks 3/6')
  expect(await said(report($, { title: sprawling }))).toBe('ok: Tasks 3/6')
  expect(await said(report($, { title: 'Something else', phase: 'delegate', total: 5 }))).toBe('ok: Tasks 0/5')
})

// Only the main session owns the flow. A subagent calling `progress` is refused, so it
// cannot rename the flow, finish it, or clear the finished runs off the panel.
test('progress: a subagent is refused and the flow it aimed at stays as it was', async ($, on) => {
  engine(on)
  await report($, { title: 'Tidy the release notes', phase: 'delegate', total: 5, done: 2 })

  const takeover = report($, { agentId: 'w7', title: 'Taken over', total: 8, done: 8, finished: true })
  expect(await said(takeover)).toBe('ignored: flow reports come from the main session')

  const svg = await svgOf(await mountBand($, 'desktop'))
  expect({ title: svg.includes('Tidy the release notes'), count: svg.includes('Tasks 2/5'), takeover: svg.includes('Taken over') }).toEqual({
    title: true,
    count: true,
    takeover: false,
  })

  // The main session's next report still lands.
  expect(await said(report($, { done: 3 }))).toBe('ok: Tasks 3/5')
})

// A model can send any JSON at all. Every field of the wrong type is dropped as if
// never sent; the call itself still succeeds.
test('progress: fields of the wrong type are dropped and the call still succeeds', async ($, on) => {
  engine(on)
  const junk: Record<string, unknown>[] = [
    { title: 42, tasks: 'not a list' },
    { title: { text: 'x' }, total: 'many', done: Number.NaN, phase: 'shipping', finished: 1 },
    { tasks: [undefined, 3, 'loose', { title: false }, { title: 'Sound task', role: 4, after: 'everything' }] },
    { tasks: [{ title: 'Sound task', after: [1, '1', undefined, 2.5] }], total: -Infinity },
  ]
  for (const input of junk) expect(await said(report($, input))).toStartWith('ok: ')

  const panel = await mountPane($)
  expect(await panel.find({ type: 'Text', text: /Sound task/ })).toBeDefined()
  await panel.unmount()

  // A word for a count and a string for a flag are dropped too.
  expect(await said(report($, { title: 'Clean the cache', total: 4, done: 'two', phase: 'delegate' }))).toBe('ok: Tasks 0/4')
  expect(await said(report($, { done: 2, finished: 'true' }))).toBe('ok: Tasks 2/4')
})

test('progress: the phase survives only as one of the known PHASES', () => {
  const kept = PHASES.map(phase => progressInput({ phase }).phase)
  expect(kept).toEqual([...PHASES])

  const strays: unknown[] = ['PLAN', 'delegate ', 'review\n', '', 0, true, undefined, ['close'], { phase: 'close' }, 'toString', 'constructor', '__proto__']
  const survived = strays.filter(phase => progressInput({ phase }).phase !== undefined)
  expect(survived).toEqual([])
})

// Models now and then quote their numbers. A string that is a number once trimmed counts
// as that number; any other string is dropped and the count stays put.
test('progress and step: a quoted number counts as the number, other strings are ignored', async ($, on) => {
  engine(on)
  expect(await said(report($, { title: 'Sort the inbox', phase: 'delegate', total: '6', done: '2' }))).toBe('ok: Tasks 2/6')
  expect(await said(report($, { done: '\t4\n' }))).toBe('ok: Tasks 4/6')

  const notNumbers = ['', '   ', 'four', '4 done', 'NaN', 'Infinity', '-Infinity', '0x']
  const replies: string[] = []
  for (const done of notNumbers) replies.push(`${JSON.stringify(done)} -> ${await said(report($, { done }))}`)
  expect(replies).toEqual(notNumbers.map(done => `${JSON.stringify(done)} -> ok: Tasks 4/6`))

  await spawn($, { id: 'w1', type: 'general-purpose', description: 'Sort the inbox' })
  expect(await said(step($, 'w1', { done: '2', total: '5', note: 'scanning' }))).toBe('ok')
  const panel = await mountPane($)
  expect(await panel.find({ type: 'Text', text: /^2\/5 scanning$/ })).toBeDefined()
})

test('step: bad fields are dropped, done is held to total, a long note is cut to 80 characters', async ($, on) => {
  engine(on)
  await spawn($, { id: 'w1', type: 'general-purpose', description: 'Sort the inbox' })
  const junk = [{ note: 12 }, { done: 'three', total: undefined }, { done: [2], note: ['a'] }, { total: -7, done: Infinity }, { done: {}, total: true }]
  for (const input of junk) expect(await said(step($, 'w1', input))).toBe('ok')

  expect(await said(step($, 'w1', { done: 12, total: 5, note: 'y'.repeat(300) }))).toBe('ok')
  const panel = await mountPane($, 'terminal', { bodyColumns: 200 })
  const cut = `5/5 ${'y'.repeat(79)}…`
  expect((await panel.find({ type: 'Text', text: /^5\/5 y/ }))?.text).toBe(cut)

  // Steps belong to a subagent the panel shows: anyone else is turned away.
  expect(await said(step($, 'ghost', { done: 1 }))).toBe('ignored: agent ghost has no row in the panel')
  expect(await said(step($, undefined, { done: 1 }))).toBe('ignored: step reports come from subagents')
})

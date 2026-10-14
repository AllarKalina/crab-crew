import type { Register } from 'claude-code'
import { mock, test, expect } from 'claude-code/testing'

import { bareType, roleOf } from './roles'
import { bandText, boot, complete, crew, crewPane, engine, mountBand, openLog, mountPane, SURFACES, report, spawn, startSession, step, svgOf, turnStart } from './testkit'

test('roles: an agent type names its trade', () => {
  expect(roleOf('impeccable:impeccable-asset-producer')).toBe('designer')
  expect(roleOf('impeccable:impeccable-documenter')).toBe('designer')
  expect(roleOf('impeccable:impeccable-manual-edit-applier')).toBe('designer')
  // It reviews before it designs.
  expect(roleOf('impeccable:impeccable-finish-reviewer')).toBe('reviewer')
  expect(roleOf('Explore')).toBe('scout')
  expect(roleOf('Plan')).toBe('planner')
  expect(roleOf('fork')).toBe('fork')
  expect(roleOf('claude-code-guide')).toBe('other')
  expect(roleOf('statusline-setup')).toBe('other')
})

test('roles: a type is matched by whole words', () => {
  expect(roleOf('planetscale-helper')).toBe('other')
  expect(roleOf('latest-docs-fetcher')).toBe('other')
  expect(roleOf('code-reviewer')).toBe('reviewer')
  expect(roleOf('claude-security:scan-researcher')).toBe('scout')
})

test('roles: a general-purpose agent is read from the verb its task opens with', () => {
  const cases: [string, string][] = [
    ['Review the auth diff', 'reviewer'],
    ['Verification of the fix', 'reviewer'],
    ['Redesign the empty state', 'designer'],
    ['Design critique of crab costumes', 'designer'],
    ['Find where tokens are stored', 'scout'],
    ['Researching auth libraries', 'scout'],
    ['Find UI components using tokens', 'scout'],
    ['Planning the migration', 'planner'],
    ['Run the regress gate', 'runner'],
    ['Wire the CLI', 'builder'],
    // The object of the work is not the work.
    ['Address review comments', 'builder'],
    ['Implement the plan step 2', 'builder'],
    ['Fix failing tests', 'builder'],
    ['Write tests for auth', 'builder'],
    ['Add feature gate', 'builder'],
    ['Add checkout flow', 'builder'],
    ['Fix checkbox state', 'builder'],
    ['Add search bar', 'builder'],
    ['', 'builder'],
  ]
  for (const [task, role] of cases) expect(`${task} -> ${roleOf('general-purpose', task)}`).toBe(`${task} -> ${role}`)
  expect(roleOf('claude', '')).toBe('builder')
  // A named agent keeps its trade whatever the task says.
  expect(roleOf('Explore', 'Review the auth diff')).toBe('scout')
})

test('roles: a plugin agent shows without its plugin', () => {
  expect(bareType('impeccable:impeccable-asset-producer')).toBe('asset-producer')
  expect(bareType('general-purpose')).toBe('general-purpose')
})

test('auto flow: subagents alone raise the band, named by the prompt, and close it', async ($, on) => {
  engine(on)
  await turnStart($, 'Fix the flaky login test\nmore detail')
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  await spawn($, { id: 'a2', type: 'general-purpose', description: 'Wire the fix' })
  expect(await bandText($, /^Fix the flaky login test$/)).toBe(1)
  expect(await bandText($, /^Tasks 0\/2$/)).toBe(1)

  await complete($, 'a1')
  expect(await bandText($, /^Tasks 1\/2$/)).toBe(1)

  // The last agent ends while the main loop still works: the flow stays open for more.
  await complete($, 'a2')
  expect(await bandText($, /^Tasks 2\/2$/)).toBe(1)
  await spawn($, { id: 'a3', type: 'Plan', description: 'Plan the follow-up' })
  expect(await bandText($, /^Tasks 2\/3$/)).toBe(1)

  await complete($, 'a3')
  await complete($)
  expect(await bandText($, /^Done$/)).toBe(1)
})

test('auto flow: the first report takes it over and keeps its runs', async ($, on) => {
  engine(on)
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  const taken = await report($, { title: 'Login fix', phase: 'delegate', total: 5, done: 2 })
  expect(taken).toMatchObject({ result: 'ok: Tasks 2/5' })

  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /^Find the login tests$/ })).toBeDefined()
})

test('panel: each row names its role', async ($, on) => {
  engine(on)
  await spawn($, { id: 'a1', type: 'impeccable:impeccable-asset-producer', description: 'Cut the hero assets' })
  await spawn($, { id: 'a2', type: 'general-purpose', description: 'Review the auth diff' })

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    if (surface === 'terminal') {
      expect(await ui.find({ type: 'Text', text: /^designer$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^reviewer$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /asset-producer/ })).toBeDefined()
      // Each row leads with its crab, one Raster of half blocks.
      const crabs = await ui.findAll({ type: 'Raster' })
      expect(crabs.length).toBe(2)
      expect(crabs[0]?.props.cells).not.toBe(crabs[1]?.props.cells)
    } else {
      const drawn = await svgOf(ui)
      expect(drawn).toContain('c-designer run')
      expect(drawn).toContain('c-reviewer run')
    }
    await ui.unmount()
  }
})

test('step reports: built-in agents are asked, plugin agents are left alone', async ($, on) => {
  const briefs: string[] = []
  engine(on, { briefs })
  await spawn($, { id: 'a1', type: 'general-purpose', description: 'Wire the fix', prompt: 'Do it.' })
  await spawn($, { id: 'a2', type: 'impeccable:impeccable-documenter', description: 'Record the design', prompt: 'Do it.' })
  expect(briefs[0]).toContain('mcp__crab-crew__step')
  expect(briefs[1]).toBe('Do it.')

  expect(await step($, 'a1', { done: 1, total: 4, note: 'reading' })).toMatchObject({ result: 'ok' })
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /1\/4 reading/ })).toBeDefined()
})

test('step reports: off leaves every brief alone', { options: { stepReports: 'off' } }, async ($, on) => {
  const briefs: string[] = []
  engine(on, { briefs })
  await spawn($, { id: 'a1', type: 'general-purpose', description: 'Wire the fix', prompt: 'Do it.' })
  expect(briefs[0]).toBe('Do it.')
})

test('reload: a pane that was up comes back, one the person closed does not', async ($, on) => {
  const opened = openLog(on)
  let isUp = false
  on('ui.close', () => {
    isUp = false
    return { value: undefined } as never
  })
  boot(on, { panes: () => (isUp ? [crewPane()] : []) })
  const start = () => startSession($)

  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  expect(opened).toEqual(['crew'])

  // The reload dropped the pane without telling the mod.
  await start()
  expect(opened).toEqual(['crew', 'crew'])

  // Closed from the band's crew button: the next reload leaves it closed.
  isUp = true
  const ui = await mountBand($)
  await ui.press({ key: 'crew-open' })
  expect(isUp).toBe(false)
  await start()
  expect(opened).toEqual(['crew', 'crew'])
})

// The test's `$` has no `ui.close`, and a test's own hook may not call it (the scan
// lists no calls), so the person's close mark cannot be raised as such. A plugin
// loaded beside the mod closes the pane instead: the close passes through the mod's
// `ui.close` hook all the same, with origin `plugin`, which the hook does not read.
const closer: Register = on => {
  on('command.run', { command: 'close-crew' }, async $ => {
    await $.ui.close({ id: 'crew' })
    return { text: '' }
  })
}

test('reload: a pane closed from outside the mod stays closed', { plugins: [{ name: 'closer', register: closer }] }, async ($, on) => {
  const opened = openLog(on)
  const closed = panes(on, opened)
  expect((await crew($, 'open'))?.text).toBe('Crew panel opened.')
  await ($.command.run as (event: unknown) => Promise<unknown>)({ command: 'close-crew', args: '', origin: 'person' })
  expect(closed).toEqual(['crew'])
  // The hook cleared the open mark: the reload leaves the pane closed.
  await startSession($)
  expect(opened).toEqual(['crew'])
})

test('auto open: flow mode opens again for the next flow, even under the same title', { options: { autoOpen: 'flow' } }, async ($, on) => {
  const opened = openLog(on)
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  await spawn($, { id: 'a2', type: 'Plan', description: 'Plan the fix' })
  expect(opened.length).toBe(1)
  await complete($, 'a1')
  await complete($, 'a2')
  await complete($)

  await spawn($, { id: 'a3', type: 'Explore', description: 'Find the login tests' })
  expect(opened.length).toBe(2)
})

// A report without a title after a finished flow starts the next one all the same:
// the finished runs leave its count, and `flow` opens the pane for it again.
test('progress: an untitled report after a finished flow starts afresh', { options: { autoOpen: 'flow' } }, async ($, on) => {
  const opened = openLog(on)
  await turnStart($, 'Fix the flaky login test')
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  await spawn($, { id: 'a2', type: 'Plan', description: 'Plan the fix' })
  await complete($, 'a1')
  await complete($, 'a2')
  await complete($)
  expect(await bandText($, /^Done$/)).toBe(1)

  expect(await report($, { phase: 'delegate', total: 1, done: 0 })).toMatchObject({ result: 'ok: Tasks 0/1' })
  const ui = await mountBand($)
  expect((await ui.find({ key: 'crew-open' }))?.props.label).toBe('×0')
  await ui.unmount()
  await spawn($, { id: 'a3', type: 'Explore', description: 'Find the flaky test' })
  expect(opened).toEqual(['crew', 'crew'])
})

test('terminal: the collapsed panel is a strip of crabs', async ($, on) => {
  engine(on)
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  await spawn($, { id: 'a2', type: 'Plan', description: 'Plan the fix' })
  const ui = await mountPane($)
  await ui.press({ key: 'compact' })
  expect((await ui.findAll({ type: 'Raster' })).length).toBe(2)
  expect(await ui.find({ type: 'Text', text: /^Find the login tests$/ })).toBeUndefined()
})

test('auto flow: a turn without a prompt does not reuse the last one as its title', async ($, on) => {
  engine(on)
  await turnStart($, 'Fix the flaky login test')
  await complete($)
  await turnStart($, '')
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  expect(await bandText($, /^Subagents$/)).toBe(1)
  expect(await bandText($, /flaky/)).toBe(0)
})

test('surfaces: vscode and mobile render band and panel as SVG, same as desktop', async ($, on) => {
  engine(on)
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  for (const surface of ['vscode', 'mobile'] as const) {
    const bar = await mountBand($, surface)
    expect(`${surface} band: ${(await bar.findAll({ type: 'Svg' })).length}`).toBe(`${surface} band: 1`)
    await bar.unmount()
    const ui = await mountPane($, surface)
    const drawn = await svgOf(ui)
    expect(`${surface} pane: ${drawn.includes('c-scout run')}`).toBe(`${surface} pane: true`)
    expect(await ui.find({ type: 'Text', text: /▣/ })).toBeUndefined()
    await ui.unmount()
  }
})

// The engine's panes as the mod sees them: up once opened, down once closed.
const panes = (on: Parameters<typeof engine>[0], opened: string[]) => {
  const closed: string[] = []
  on('ui.close', (_$, { id }) => {
    closed.push(id)
    return { value: undefined } as never
  })
  boot(on, { panes: () => (opened.length > closed.length ? [crewPane()] : []) })
  return closed
}

test('/crew toggles the panel; /crew open shows or focuses it but never closes it', async ($, on) => {
  const opened = openLog(on)
  const closed = panes(on, opened)
  expect((await crew($))?.text).toBe('Crew panel opened.')
  expect((await crew($))?.text).toBe('Crew panel closed.')
  expect([opened.length, closed.length]).toEqual([1, 1])
  expect((await crew($, 'open'))?.text).toBe('Crew panel opened.')
  expect((await crew($, 'open'))?.text).toBe('Crew panel opened.')
  expect([opened.length, closed.length]).toEqual([3, 1])
  // No flow yet: `/crew bar` has nothing to bring back.
  expect((await crew($, 'bar'))?.text).toBe('No flow yet: the bar appears when a subagent starts.')
})

test('auto open: off leaves the panel shut, whatever starts', { options: { autoOpen: 'off' } }, async ($, on) => {
  const opened = openLog(on)
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  await report($, { title: 'Ship it', phase: 'delegate', tasks: [{ title: 'Draft the migration' }] })
  expect(opened).toEqual([])
})

test('/crew and the crew count open a pane waiting undrawn, and close one drawn behind another tab', async ($, on) => {
  const opened = openLog(on)
  const closed: string[] = []
  on('ui.close', (_$, { id }) => {
    closed.push(id)
    return { value: undefined } as never
  })
  // A narrow terminal: listed, not drawn, no tab in front. The toggle opens it.
  let listed = crewPane({ isPlaced: false, isShown: false })
  boot(on, { panes: () => [listed] })
  expect((await crew($))?.text).toBe('Crew panel opened.')
  expect([opened.length, closed]).toEqual([1, []])
  // Drawn, behind another tab: a re-open would only retitle it, so the toggle closes it.
  listed = crewPane({ isShown: false })
  expect((await crew($))?.text).toBe('Crew panel closed.')
  expect([opened.length, closed]).toEqual([1, ['crew']])
  // The crew count does the same.
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  const ui = await mountBand($)
  const before = opened.length
  await ui.press({ key: 'crew-open' })
  expect([opened.length - before, closed]).toEqual([0, ['crew', 'crew']])
})

test('/crew open asks for the focus, and says when the pane waits undrawn', async ($, on) => {
  mock.clock(on)
  const asked: (true | undefined)[] = []
  let answer: { isPlaced: true } | { isPlaced: false; reason: string } = { isPlaced: true }
  on('ui.open', (_$, { focus }) => {
    asked.push(focus)
    return { value: answer }
  })
  on('ui.close', () => ({ value: undefined }) as never)
  let listed: ReturnType<typeof crewPane>[] = []
  boot(on, { panes: () => listed })
  expect((await crew($, 'open'))?.text).toBe('Crew panel opened.')
  answer = { isPlaced: false, reason: 'no surface places panes' }
  expect((await crew($, 'open'))?.text).toBe('Crew panel open, not drawn yet: no surface places panes')
  // The toggle opens without asking for the keys.
  expect((await crew($))?.text).toBe('Crew panel open, not drawn yet: no surface places panes')
  expect(asked).toEqual([true, true, undefined])
  // The band's crew count toggles as `/crew` does: it opens without asking for the keys.
  await report($, { title: 'Ship it', phase: 'delegate', total: 1, done: 0 })
  const ui = await mountBand($)
  await ui.press({ key: 'crew-open' })
  await ui.unmount()
  expect(asked).toEqual([true, true, undefined, undefined])
  // An open taken undrawn is open all the same: closed first, then opened undrawn, a
  // reload that dropped it opens it again.
  listed = [crewPane()]
  expect((await crew($))?.text).toBe('Crew panel closed.')
  listed = []
  expect((await crew($, 'open'))?.text).toBe('Crew panel open, not drawn yet: no surface places panes')
  await startSession($)
  expect(asked).toEqual([true, true, undefined, undefined, true, undefined])
})

test('reload: a pane still listed, drawn or not, is not opened again', async ($, on) => {
  const opened = openLog(on)
  boot(on, { panes: () => (opened.length ? [crewPane({ isPlaced: false, isShown: false })] : []) })
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  expect(opened).toEqual(['crew'])
  await startSession($)
  expect(opened).toEqual(['crew'])
})

test('auto open: an open a hook refused is not remembered, so a reload does not retry it', async ($, on) => {
  mock.clock(on)
  const asked: string[] = []
  on('ui.open', (_$, { id }) => {
    asked.push(id)
    return { deny: 'no room' } as never
  })
  on('agent.spawn', (_$, call) => ({ agentId: call.tool_use_id, model: 'claude-opus-5-5' }))
  boot(on)
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  expect(asked).toEqual(['crew'])
  await startSession($)
  expect(asked).toEqual(['crew'])
  // The person's own ask is refused all the same, and says so.
  expect((await crew($))?.text).toBe('Crew panel not opened: the open was refused.')
})

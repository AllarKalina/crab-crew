import { test, expect } from 'claude-code/testing'

import { CARETS } from './glyphs'
import { colorOf, dimColorOf } from './roles'
import { M, contrast } from './theme'
import { answerAll, complete, engine, modelStep, mountPane, report, spawn, step, svgOf, turnStart } from './testkit'

// Every Opus request bills 300k prompt tokens and no others: 30% of its 1M window.
const OPUS_300K = { model: 'claude-opus-5-5', input_tokens: 300_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const tasks = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Task ${i + 1}`, role: 'builder' }))

test('desktop: the collapsed panel is one row of crabs, a count of the rest and the totals', async ($, on) => {
  engine(on)
  await report($, { title: 'Ship it', phase: 'delegate', tasks: tasks(20) })
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  const ui = await mountPane($, 'desktop')
  await ui.press({ key: 'compact' })
  const rows = await ui.findAll({ type: 'Svg' })
  expect(rows.length).toBe(1)
  expect(rows[0]?.props.height).toBe(32)
  const row = await svgOf(ui)
  // 60 columns are 472px: room for 8 crabs, the running scout first.
  expect(row.match(/class="c-/g)?.length).toBe(8)
  expect(row.match(/class="c-(\w+)/)?.[1]).toBe('scout')
  expect(row).toContain('+13')
  await ui.press({ key: 'compact' })
  expect((await ui.findAll({ type: 'Svg' })).length).toBeGreaterThan(1)
})

test('desktop: a grid taller than the engine allows one Svg is stacked from tiles', async ($, on) => {
  engine(on)
  // 100 planned rows of 46px: past the 4096px an Svg may be.
  await report($, { title: 'Ship it', phase: 'delegate', tasks: tasks(100) })
  const ui = await mountPane($, 'desktop')
  const tiles = (await ui.findAll({ type: 'Svg' })).filter(el => el.props.alt === 'dotted grid').map(el => Number(el.props.height))
  expect(tiles.length).toBe(2)
  expect(tiles[0]).toBe(4096)
  expect(tiles.every(h => h > 0 && h <= 4096)).toBe(true)
  // As tall as what is laid over it: the header, two lines (the toggle and the
  // heading) and the planned rows.
  expect(tiles[0]! + tiles[1]!).toBe(72 + 2 * 24 + 100 * 46)
})

test('terminal: a generic agent type is left out of the meta line, a named one kept', async ($, on) => {
  engine(on)
  await spawn($, { id: 'a1', type: 'general-purpose', description: 'Wire the fix' })
  await spawn($, { id: 'a2', type: 'claude', description: 'Wire the docs' })
  await spawn($, { id: 'a3', type: 'Explore', description: 'Find the login tests' })
  await spawn($, { id: 'a4', type: 'impeccable:impeccable-documenter', description: 'Record the design' })
  const ui = await mountPane($)
  // The meta line's tail: the model, never the generic type.
  const metas = (await ui.findAll({ type: 'Text', text: /Opus/ })).map(t => t.text).filter(t => t.startsWith(' · '))
  expect(metas.filter(t => /general-purpose|claude/.test(t))).toEqual([])
  expect(metas.some(t => t.startsWith(' · Explore · '))).toBe(true)
  expect(metas.some(t => t.startsWith(' · documenter · '))).toBe(true)
  expect(metas.filter(t => /^ · Opus/.test(t)).length).toBe(2)
})

test('terminal: a running row fills its line in the role colour, the context fallback a shade darker', async ($, on) => {
  engine(on)
  // Each model request fills a third of the window.
  answerAll(on, OPUS_300K)
  await spawn($, { id: 'a1', type: 'general-purpose', description: 'Wire the fix' })
  await spawn($, { id: 'a2', type: 'general-purpose', description: 'Wire the docs' })
  await modelStep($, 'a2', 'claude-opus-5-5')
  await step($, 'a1', { done: 2, total: 4, note: 'reading' })
  const ui = await mountPane($)
  // Newest first, each row its fill then its track: the docs row reports no steps
  // and shows its context; the fix row its steps, at full strength.
  // The line's own Text holds the two coloured runs.
  const lines = (await ui.findAll({ type: 'Text', text: /^━+$/ })).map(t => t.props.color).filter(Boolean)
  expect(lines).toEqual([dimColorOf('builder'), M.surface1, colorOf('builder'), M.surface1])
})

test('desktop: as in the terminal, the context fallback is the role colour dimmed, the step note secondary, a generic type left out', async ($, on) => {
  engine(on)
  answerAll(on, OPUS_300K)
  await spawn($, { id: 'a1', type: 'general-purpose', description: 'Wire the fix' })
  await spawn($, { id: 'a2', type: 'claude', description: 'Wire the docs' })
  await modelStep($, 'a2', 'claude-opus-5-5')
  await step($, 'a1', { done: 2, total: 4, note: 'reading' })
  const ui = await mountPane($, 'desktop')
  const rows = (await ui.findAll({ type: 'Svg' })).map(node => String(node.props.source))
  const rowOf = (title: string) => rows.find(r => r.includes(`>${title}<`)) ?? ''
  const fillOf = (row: string) => /<rect x="42" y="55" width="\d+" height="4" rx="2" fill="([^"]+)"\/>/.exec(row)?.[1]
  expect([fillOf(rowOf('Wire the docs')), fillOf(rowOf('Wire the fix'))]).toEqual([dimColorOf('builder'), colorOf('builder')])
  expect(dimColorOf('builder')).toBe('#5e78a8')
  expect(/<text class="(\w+)" x="42" y="49"[^>]*>2\/4 reading</.exec(rowOf('Wire the fix'))?.[1]).toBe('s')
  expect(rows.join('')).not.toMatch(/general-purpose|>\s*claude\b/)
  expect(rowOf('Wire the docs')).toContain('Opus 5.5')
})

test('terminal: the step note is dimmed, leaving the title the one bright line', async ($, on) => {
  engine(on)
  await spawn($, { id: 'a1', type: 'general-purpose', description: 'Wire the fix' })
  await step($, 'a1', { done: 15, total: 15, note: 'report' })
  const ui = await mountPane($)
  expect((await ui.find({ type: 'Text', text: /^15\/15 report$/ }))?.props.color).toBe(M.subtext0)
  expect((await ui.find({ type: 'Text', text: /^Wire the fix$/ }))?.props).toMatchObject({ bold: true, color: M.text })
})

// An element as drawn, from a FoundElement's children: its tag, props and children.
type Drawn = { type: string; props?: Record<string, unknown>; children?: unknown[] }
const drawnText = (n: unknown): string =>
  typeof n === 'string' ? n : (n as Drawn).type === 'Button' ? String((n as Drawn).props?.label) : ((n as Drawn).children ?? []).map(drawnText).join('')

test('terminal: the section headings are siblings in one column, all one dim grey, each below another section a line clear', async ($, on) => {
  engine(on)
  await turnStart($, 'Ship it')
  await report($, { title: 'Ship it', phase: 'delegate', tasks: tasks(3) })
  await spawn($, { id: 'a1', type: 'general-purpose', description: 'Task 1' })
  await spawn($, { id: 'a2', type: 'general-purpose', description: 'Wire the docs' })
  await complete($, 'a1')
  const ui = await mountPane($)
  const keys = ['h-run', 'h-done', 'h-plan']
  // One parent column holds the three, none indented: each starts at its left edge.
  const parents = (await ui.findAll({ type: 'Box' })).filter(b => b.props.flexDirection === 'column' && keys.every(k => b.children.some(c => (c as Drawn).props?.key === k)))
  expect(parents.length).toBe(1)
  const headings = await Promise.all(keys.map(key => ui.find({ key })))
  for (const h of headings) {
    expect([h?.props.paddingLeft, h?.props.marginLeft, h?.props.paddingX, h?.props.marginX].filter(v => v !== undefined && v !== 0)).toEqual([])
    // The heading is its one child, its words first: nothing ahead of them in the column.
    expect(h?.children.length).toBe(1)
  }
  expect(headings.map(h => drawnText(h))).toEqual(['Running · 1', `Finished · 1 ${CARETS.nerd[1]}`, expect.stringMatching(/^Planned · \d+$/)])
  // All three in Claude Code's dim grey, none in a colour of its own.
  const shown = headings.map(h => h?.children[0] as Drawn)
  expect(shown.map(n => [n.type, n.props?.dimColor, n.props?.color])).toEqual([
    ['Text', true, undefined],
    ['Button', true, undefined],
    ['Text', true, undefined],
  ])
  expect(headings.map(h => h?.props.marginTop)).toEqual([0, 1, 1])
})

test('terminal: the caret is in the Finished Button\'s label, the whole heading one press', async ($, on) => {
  engine(on)
  await spawn($, { id: 'a1', type: 'general-purpose', description: 'Task 1' })
  await complete($, 'a1')
  const ui = await mountPane($)
  const label = async () => (await ui.find({ type: 'Button', key: 'done' }))?.props.label
  expect(await label()).toBe(`Finished · 1 ${CARETS.nerd[1]}`)
  // No caret drawn apart from the Button.
  expect(await ui.find({ type: 'Text', text: new RegExp(`[${[...CARETS.nerd, ...CARETS.plain].join('')}]`, 'u') })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^Task 1$/ })).toBeDefined()
  await ui.press({ key: 'done' })
  expect(await label()).toBe(`Finished · 1 ${CARETS.nerd[0]}`)
  expect(await ui.find({ type: 'Text', text: /^Task 1$/ })).toBeUndefined()
  await ui.press({ key: 'done' })
  expect(await ui.find({ type: 'Text', text: /^Task 1$/ })).toBeDefined()
})

test('terminal: plain glyphs, a font without Nerd glyphs, draw the caret as triangles', { options: { glyphs: 'plain' } }, async ($, on) => {
  engine(on)
  await spawn($, { id: 'a1', type: 'general-purpose', description: 'Task 1' })
  await complete($, 'a1')
  const ui = await mountPane($)
  expect((await ui.find({ type: 'Button', key: 'done' }))?.props.label).toBe('Finished · 1 ▾')
  await ui.press({ key: 'done' })
  expect((await ui.find({ type: 'Button', key: 'done' }))?.props.label).toBe('Finished · 1 ▸')
})

test('desktop: the Finished toggle carries its triangle in the label', async ($, on) => {
  engine(on)
  await spawn($, { id: 'a1', type: 'general-purpose', description: 'Task 1' })
  await complete($, 'a1')
  const ui = await mountPane($, 'desktop')
  expect((await ui.find({ type: 'Button', key: 'done' }))?.props.label).toBe('Finished · 1 ▾')
  await ui.press({ key: 'done' })
  expect((await ui.find({ type: 'Button', key: 'done' }))?.props.label).toBe('Finished · 1 ▸')
})

test('terminal: a step note takes the room the stats can spare, the context fill first, the cost on narrow widths', async ($, on) => {
  engine(on)
  // A realistic row: 300k tokens of context, a dollar or more spent.
  answerAll(on, OPUS_300K)
  await spawn($, { id: 'a1', type: 'general-purpose', description: 'Test the second finish' })
  await spawn($, { id: 'a2', type: 'general-purpose', description: 'Wire the docs' })
  await modelStep($, 'a1', 'claude-opus-5-5')
  await modelStep($, 'a2', 'claude-opus-5-5')
  await step($, 'a1', { done: 3, total: 5, note: 'crew pane crops' })
  await step($, 'a2', { done: 2, total: 4, note: 'reading' })
  const statsOf = async (ui: Awaited<ReturnType<typeof mountPane>>) =>
    (await ui.findAll({ type: 'Text', text: /^(ctx \d+% · )?\d+k( · ≈\$[\d.]+)?$/ })).filter(t => !t.props.bold).map(t => t.text ?? '')
  // 57 columns give 40 of row text, the usual: the note shows whole beside tokens and
  // cost; the short one keeps its row's context fill.
  let ui = await mountPane($, 'terminal', { bodyColumns: 57 })
  expect((await ui.find({ type: 'Text', text: /^3\/5 / }))?.text).toBe('3/5 crew pane crops')
  expect(await statsOf(ui)).toEqual([expect.stringMatching(/^ctx \d+% · 300k · ≈\$/), expect.stringMatching(/^300k · ≈\$/)])
  await ui.unmount()
  // 50 give the live pane's 33: the cost gives way too.
  ui = await mountPane($, 'terminal', { bodyColumns: 50 })
  expect((await ui.find({ type: 'Text', text: /^3\/5 / }))?.text).toBe('3/5 crew pane crops')
  expect((await ui.find({ type: 'Text', text: /^2\/4 / }))?.text).toBe('2/4 reading')
  expect(await statsOf(ui)).toEqual([expect.stringMatching(/^300k · ≈\$/), '300k'])
  await ui.unmount()
  // A note too long to show whole even beside the tokens alone is cut there, the cost
  // gone first, the ellipsis closed up to the word.
  await step($, 'a1', { done: 3, total: 5, note: 'crew pane crops and the band stars drift on by' })
  ui = await mountPane($, 'terminal', { bodyColumns: 57 })
  expect((await ui.find({ type: 'Text', text: /^3\/5 / }))?.text).toBe('3/5 crew pane crops and the band…')
  expect(await statsOf(ui)).toEqual([expect.stringMatching(/^ctx \d+% · 300k · ≈\$/), '300k'])
})

test('terminal: a step note with no total reported still shows, alone', async ($, on) => {
  engine(on)
  await spawn($, { id: 'a1', type: 'general-purpose', description: 'Wire the fix' })
  await step($, 'a1', { done: 0, note: 'reading' })
  const ui = await mountPane($)
  expect((await ui.find({ type: 'Text', text: /reading/ }))?.text).toBe('reading')
  expect(await svgOf(await mountPane($, 'desktop'))).toMatch(/y="49"[^>]*>reading</)
})

test('terminal: a planned row\'s title is the first line beside its crab, as a running row\'s is', async ($, on) => {
  engine(on)
  await report($, { title: 'Ship it', phase: 'delegate', tasks: tasks(2) })
  await spawn($, { id: 'a1', type: 'general-purpose', description: 'Wire the fix' })
  const ui = await mountPane($)
  // Each row: the crab's Raster, then a column of text beside it, from its top.
  const rows = (await ui.findAll({ type: 'Box' })).filter(b => b.props.flexDirection === 'row' && (b.children[0] as Drawn | undefined)?.type === 'Raster')
  const firstLines = rows.map(r => {
    const column = r.children[1] as Drawn
    const top = ['marginTop', 'paddingTop', 'marginY', 'paddingY'].map(k => column.props?.[k] ?? 0)
    return [drawnText(column.children?.[0]), ...top]
  })
  expect(firstLines).toEqual([
    ['Wire the fix0:00 ●', 0, 0, 0, 0],
    ['1. Task 1◷', 0, 0, 0, 0],
    ['2. Task 2◷', 0, 0, 0, 0],
  ])
})

test('terminal: the meta line is cut by the mod, the ellipsis closed up to the word', async ($, on) => {
  engine(on)
  await spawn($, { id: 'a1', type: 'impeccable:impeccable-documenter', description: 'Record the design' })
  // 32 columns, the narrowest pane: 15 of row text.
  const ui = await mountPane($, 'terminal', { bodyColumns: 32 })
  const meta = (await ui.findAll({ type: 'Text', text: /^ · / })).map(t => t.text ?? '')
  expect(meta.length).toBe(1)
  expect(meta[0]).toMatch(/\S…$/)
})

test('terminal: the stat tiles\' captions stand 4.5 to 1 off the tile, the values bold', async ($, on) => {
  engine(on)
  await spawn($, { id: 'a1', type: 'Explore', description: 'Find the login tests' })
  const ui = await mountPane($)
  for (const k of ['Cost', 'Tokens', 'Time']) {
    const tile = await ui.find({ type: 'Box', key: k })
    const [caption, value] = (tile?.children ?? []) as { props: { color: string; backgroundColor: string; bold?: boolean } }[]
    expect(`${k}: ${contrast(caption!.props.color, caption!.props.backgroundColor) >= 4.5}`).toBe(`${k}: true`)
    expect(value?.props).toMatchObject({ bold: true, color: M.text })
  }
})

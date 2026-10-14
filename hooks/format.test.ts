import { expect, test } from 'claude-code/testing'

import { cells, clip, clipCells, fitText, textWidth } from './format'

const isWhole = (s: string) => !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(s)

test('clip: cuts by character, never half an emoji', () => {
  expect(clip('Fix 🦀🦀🦀 bug', 6)).toBe('Fix 🦀…')
  for (let max = 1; max < 14; max++) expect(isWhole(clip('Fix 🦀🦀🦀 bug', max))).toBe(true)
  // An emoji with its skin tone, or a family joined by ZWJs, is one character.
  expect(clip('👍🏽👍🏽👍🏽', 2)).toBe('👍🏽…')
  expect(clip('short', 10)).toBe('short')
})

test('cells: CJK and emoji take two terminal cells, the rest one', () => {
  expect(cells('ab')).toBe(2)
  expect(cells('漢字ab')).toBe(6)
  expect(cells('🦀 crab')).toBe(7)
  expect(clipCells('漢字漢字', 5)).toBe('漢字…')
  expect(clipCells('漢字漢字', 8)).toBe('漢字漢字')
  // A wide character that would cross the edge gives way to the ellipsis.
  expect(clipCells('a漢字', 3)).toBe('a…')
  for (let max = 2; max < 12; max++) expect(cells(clipCells('Fix 🦀 漢字 bug', max))).toBeLessThanOrEqual(max)
})

test('clip, clipCells, fitText: a cut at a word break closes the ellipsis up to the word', () => {
  // Each cut falls just past a space: "Redesign the band crab " and "3/5 crew ".
  expect(clipCells('Redesign the band crab icons', 24)).toBe('Redesign the band crab…')
  expect(clipCells('3/5 crew pane crops', 10)).toBe('3/5 crew…')
  expect(clip('3/5 crew pane crops', 10)).toBe('3/5 crew…')
  expect(clip('a   b', 4)).toBe('a…')
  expect(fitText('Redesign the band crab icons', 10, textWidth('Redesign the band crab …', 10))).toBe('Redesign the band crab…')
  for (let max = 2; max < 20; max++) expect(clipCells('3/5 crew pane crops', max)).not.toMatch(/\s…$/)
})

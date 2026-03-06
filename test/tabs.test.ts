import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { getNextTabValue } from '../src/components/ui/tabs-helpers.ts'

test('getNextTabValue supports roving keyboard navigation', () => {
  const values = ['today', 'history', 'templates']

  assert.equal(getNextTabValue(values, 'today', 'ArrowRight'), 'history')
  assert.equal(getNextTabValue(values, 'today', 'ArrowLeft'), 'templates')
  assert.equal(getNextTabValue(values, 'history', 'Home'), 'today')
  assert.equal(getNextTabValue(values, 'history', 'End'), 'templates')
  assert.equal(getNextTabValue(values, 'history', 'Enter'), 'history')
})

test('tabs source includes linked semantics for the tab contract', () => {
  const source = readFileSync(new URL('../src/components/ui/tabs.tsx', import.meta.url), 'utf8')

  assert.match(source, /role="tablist"/)
  assert.match(source, /role="tab"/)
  assert.match(source, /aria-controls=\{panelId\}/)
  assert.match(source, /role="tabpanel"/)
  assert.match(source, /aria-labelledby=\{getTabTriggerId\(context\.baseId, value\)\}/)
})

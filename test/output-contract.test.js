const { test } = require('node:test')
const assert = require('node:assert')
const { validateAgentOutput } = require('../src/output-contract')

test('reply only 合法', () => {
  assert.strictEqual(validateAgentOutput({ reply: 'ok' }).ok, true)
})

test('card only 合法', () => {
  assert.strictEqual(validateAgentOutput({ cardAction: { type: 'confirm_create' } }).ok, true)
})

test('同时有 reply 和 card 非法', () => {
  const r = validateAgentOutput({ reply: 'x', cardAction: { type: 'confirm_create' } })
  assert.strictEqual(r.ok, false)
})

test('都没有非法', () => {
  const r = validateAgentOutput({})
  assert.strictEqual(r.ok, false)
})

test('未知 cardAction 非法', () => {
  const r = validateAgentOutput({ cardAction: { type: 'other_action' } })
  assert.strictEqual(r.ok, false)
})

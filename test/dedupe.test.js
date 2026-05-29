const { test } = require('node:test')
const assert = require('node:assert')
const { createDedupeStore, buildCallbackDedupeKey } = require('../src/dedupe')

test('checkAndMark 首次false 再次true', () => {
  const s = createDedupeStore({ ttlMs: 1000, now: () => 100 })
  assert.strictEqual(s.checkAndMark('k1').duplicate, false)
  assert.strictEqual(s.checkAndMark('k1').duplicate, true)
})

test('TTL 过期后可再次通过', () => {
  let t = 0
  const s = createDedupeStore({ ttlMs: 10, now: () => t })
  assert.strictEqual(s.checkAndMark('k1').duplicate, false)
  t = 20
  assert.strictEqual(s.checkAndMark('k1').duplicate, false)
})

test('buildCallbackDedupeKey 顺序无关', () => {
  const a = buildCallbackDedupeKey({ openId: 'u1', formValue: { b: '2', a: '1' } })
  const b = buildCallbackDedupeKey({ openId: 'u1', formValue: { a: '1', b: '2' } })
  assert.strictEqual(a, b)
})

const { test } = require('node:test')
const assert = require('node:assert')
const { createRateLimiter } = require('../src/rate-limit')

test('限流：超过阈值拒绝', () => {
  let t = 0
  const rl = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t })
  assert.strictEqual(rl.allow('u1').allowed, true)
  assert.strictEqual(rl.allow('u1').allowed, true)
  assert.strictEqual(rl.allow('u1').allowed, false)
})

test('限流：窗口过期后恢复', () => {
  let t = 0
  const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t })
  assert.strictEqual(rl.allow('u1').allowed, true)
  assert.strictEqual(rl.allow('u1').allowed, false)
  t = 1001
  assert.strictEqual(rl.allow('u1').allowed, true)
})

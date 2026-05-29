const { test } = require('node:test')
const assert = require('node:assert')
const { createKeyedQueue } = require('../src/keyed-queue')

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

test('同 key 串行执行', async () => {
  const q = createKeyedQueue()
  const order = []
  const p1 = q.run('u1', async () => { order.push('a1'); await sleep(20); order.push('a2') })
  const p2 = q.run('u1', async () => { order.push('b1'); await sleep(1); order.push('b2') })
  await Promise.all([p1, p2])
  assert.deepStrictEqual(order, ['a1', 'a2', 'b1', 'b2'])
})

test('不同 key 可并行', async () => {
  const q = createKeyedQueue()
  const started = []
  await Promise.all([
    q.run('u1', async () => { started.push('u1'); await sleep(10) }),
    q.run('u2', async () => { started.push('u2'); await sleep(10) }),
  ])
  assert.strictEqual(started.includes('u1') && started.includes('u2'), true)
})

test('任务结束后清理 key', async () => {
  const q = createKeyedQueue()
  await q.run('u1', async () => {})
  assert.strictEqual(q.size(), 0)
})

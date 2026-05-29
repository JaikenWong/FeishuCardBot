const { test } = require('node:test')
const assert = require('node:assert')
const { createTracer } = require('../src/tracing')

test('createTracer emits events', () => {
  const events = []
  const t = createTracer((e, p) => events.push([e, p]))
  t.emit('x', { a: 1 })
  assert.deepStrictEqual(events, [['x', { a: 1 }]])
})

test('createTracer swallows trace errors', () => {
  const t = createTracer(() => { throw new Error('boom') })
  assert.doesNotThrow(() => t.emit('x', {}))
})

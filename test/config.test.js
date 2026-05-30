const { test } = require('node:test')
const assert = require('node:assert')
const path = require('path')
const { loadSchema } = require('../src/form-config')

test('form-schema.json 可解析且含 6 个字段', () => {
  const schema = loadSchema(path.join(__dirname, '..', 'config', 'form-schema.json'))
  assert.strictEqual(schema.fields.length, 6)
  assert.strictEqual(schema.submit.action, 'submit_create_part')
})

test('agent.json 含 allowedTools 与限制', () => {
  const cfg = require('../config/agent.json')
  assert.ok(Array.isArray(cfg.allowedTools))
  assert.ok(cfg.allowedTools.includes('prepare_create_part'))
  assert.strictEqual(typeof cfg.maxSteps, 'number')
  assert.strictEqual(typeof cfg.maxHistory, 'number')
  assert.strictEqual(typeof cfg.openaiMaxRetries, 'number')
  assert.strictEqual(typeof cfg.maxToolArgsSize, 'number')
  assert.strictEqual(typeof cfg.maxToolCallsPerStep, 'number')
  assert.strictEqual(typeof cfg.callbackDedupeTtlMs, 'number')
  assert.strictEqual(typeof cfg.maxRequestsPerMinute, 'number')
})

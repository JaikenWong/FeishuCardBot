const { test } = require('node:test')
const assert = require('node:assert')
const { validateAgentRuntimeConfig, assertValidAgentRuntimeConfig } = require('../src/config-validator')

test('有效配置通过', () => {
  const schema = { fields: [{ name: 'material_name', type: 'input', required: true }] }
  const agentConfig = { allowedTools: ['list_field_options', 'prepare_create_part'], maxSteps: 6, maxHistory: 20, openaiMaxRetries: 1, callbackDedupeTtlMs: 300000, maxRequestsPerMinute: 20 }
  const out = validateAgentRuntimeConfig({ schema, agentConfig })
  assert.strictEqual(out.ok, true)
})

test('缺工具与字段报错', () => {
  const schema = { fields: [{ type: 'select', required: true }] }
  const agentConfig = { allowedTools: [], maxSteps: 0, maxHistory: -1 }
  const out = validateAgentRuntimeConfig({ schema, agentConfig })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.length >= 4)
})

test('assertValidAgentRuntimeConfig 失败抛错', () => {
  assert.throws(() => assertValidAgentRuntimeConfig({ schema: { fields: [] }, agentConfig: {} }), /配置校验失败/)
})

test('openaiMaxRetries 非法时报错', () => {
  const schema = { fields: [{ name: 'material_name', type: 'input', required: true }] }
  const out = validateAgentRuntimeConfig({
    schema,
    agentConfig: { allowedTools: ['list_field_options', 'prepare_create_part'], maxSteps: 6, maxHistory: 20, openaiMaxRetries: -1 },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('openaiMaxRetries')))
})

test('callbackDedupeTtlMs 非法时报错', () => {
  const schema = { fields: [{ name: 'material_name', type: 'input', required: true }] }
  const out = validateAgentRuntimeConfig({
    schema,
    agentConfig: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: 6,
      maxHistory: 20,
      callbackDedupeTtlMs: 0,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('callbackDedupeTtlMs')))
})

test('maxRequestsPerMinute 非法时报错', () => {
  const schema = { fields: [{ name: 'material_name', type: 'input', required: true }] }
  const out = validateAgentRuntimeConfig({
    schema,
    agentConfig: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: 6,
      maxHistory: 20,
      maxRequestsPerMinute: 0,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('maxRequestsPerMinute')))
})

test('范围上限保护生效', () => {
  const schema = { fields: [{ name: 'material_name', type: 'input', required: true }] }
  const out = validateAgentRuntimeConfig({
    schema,
    agentConfig: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: 99,
      maxHistory: 999,
      openaiMaxRetries: 9,
      callbackDedupeTtlMs: 99999999,
      maxRequestsPerMinute: 999,
      maxToolArgsSize: 999999,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('maxSteps')))
  assert.ok(out.errors.some((e) => e.includes('maxHistory')))
  assert.ok(out.errors.some((e) => e.includes('openaiMaxRetries')))
  assert.ok(out.errors.some((e) => e.includes('callbackDedupeTtlMs')))
  assert.ok(out.errors.some((e) => e.includes('maxRequestsPerMinute')))
  assert.ok(out.errors.some((e) => e.includes('maxToolArgsSize')))
})

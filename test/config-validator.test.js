const { test } = require('node:test')
const assert = require('node:assert')
const { validateAgentRuntimeConfig, assertValidAgentRuntimeConfig } = require('../src/config-validator')

test('有效配置通过', () => {
  const schema = { fields: [{ name: 'material_name', type: 'input', required: true }] }
  const agentConfig = {
    allowedTools: ['list_field_options', 'prepare_create_part'],
    maxSteps: 6,
    maxHistory: 20,
    openaiMaxRetries: 1,
    callbackDedupeTtlMs: 300000,
    maxRequestsPerMinute: 20,
    maxToolArgsSize: 4096,
    maxToolCallsPerStep: 5,
  }
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
    agentConfig: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: 6,
      maxHistory: 20,
      openaiMaxRetries: -1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
    },
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
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 0,
      maxRequestsPerMinute: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
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
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 0,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
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
      maxToolCallsPerStep: 999,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('maxSteps')))
  assert.ok(out.errors.some((e) => e.includes('maxHistory')))
  assert.ok(out.errors.some((e) => e.includes('openaiMaxRetries')))
  assert.ok(out.errors.some((e) => e.includes('callbackDedupeTtlMs')))
  assert.ok(out.errors.some((e) => e.includes('maxRequestsPerMinute')))
  assert.ok(out.errors.some((e) => e.includes('maxToolArgsSize')))
  assert.ok(out.errors.some((e) => e.includes('maxToolCallsPerStep')))
})

test('未知配置字段时报错', () => {
  const schema = { fields: [{ name: 'material_name', type: 'input', required: true }] }
  const out = validateAgentRuntimeConfig({
    schema,
    agentConfig: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: 6,
      maxHistory: 20,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
      typoFlag: true,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('未知字段')))
})

test('护栏字段缺失时报显式配置错误', () => {
  const schema = { fields: [{ name: 'material_name', type: 'input', required: true }] }
  const out = validateAgentRuntimeConfig({
    schema,
    agentConfig: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: 6,
      maxHistory: 20,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('openaiMaxRetries 必须显式配置')))
  assert.ok(out.errors.some((e) => e.includes('maxToolArgsSize 必须显式配置')))
  assert.ok(out.errors.some((e) => e.includes('maxToolCallsPerStep 必须显式配置')))
  assert.ok(out.errors.some((e) => e.includes('callbackDedupeTtlMs 必须显式配置')))
  assert.ok(out.errors.some((e) => e.includes('maxRequestsPerMinute 必须显式配置')))
})

test('allowedTools 重复时报错', () => {
  const schema = { fields: [{ name: 'material_name', type: 'input', required: true }] }
  const out = validateAgentRuntimeConfig({
    schema,
    agentConfig: {
      allowedTools: ['list_field_options', 'prepare_create_part', 'list_field_options'],
      maxSteps: 6,
      maxHistory: 20,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('allowedTools 含重复工具')))
})

test('allowedTools 含非法元素时报错', () => {
  const schema = { fields: [{ name: 'material_name', type: 'input', required: true }] }
  const out = validateAgentRuntimeConfig({
    schema,
    agentConfig: {
      allowedTools: ['list_field_options', '', null],
      maxSteps: 6,
      maxHistory: 20,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('仅允许非空字符串')))
})

test('allowedTools 为空时报错', () => {
  const schema = { fields: [{ name: 'material_name', type: 'input', required: true }] }
  const out = validateAgentRuntimeConfig({
    schema,
    agentConfig: {
      allowedTools: [],
      maxSteps: 6,
      maxHistory: 20,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('allowedTools 不能为空')))
})

test('allowedTools 含未知工具时报错', () => {
  const schema = { fields: [{ name: 'material_name', type: 'input', required: true }] }
  const out = validateAgentRuntimeConfig({
    schema,
    agentConfig: {
      allowedTools: ['list_field_options', 'prepare_create_part', 'not_exist_tool'],
      maxSteps: 6,
      maxHistory: 20,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('allowedTools 含未知工具')))
})

test('systemPrompt 为空时报错', () => {
  const schema = { fields: [{ name: 'material_name', type: 'input', required: true }] }
  const out = validateAgentRuntimeConfig({
    schema,
    agentConfig: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: 6,
      maxHistory: 20,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
      systemPrompt: ' ',
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('systemPrompt 必须是非空字符串')))
})

test('topicBoundary 为空时报错', () => {
  const schema = { fields: [{ name: 'material_name', type: 'input', required: true }] }
  const out = validateAgentRuntimeConfig({
    schema,
    agentConfig: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: 6,
      maxHistory: 20,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
      topicBoundary: '',
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('topicBoundary 必须是非空字符串')))
})

test('select optionSource.type/endpoint 非法时报错', () => {
  const schema = {
    fields: [{ name: 'project_number', type: 'select', required: true, optionSource: { type: 'plm', endpoint: 'bad' } }],
  }
  const out = validateAgentRuntimeConfig({
    schema,
    agentConfig: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: 6,
      maxHistory: 20,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('optionSource.endpoint 非法')))
})

test('select static options 为空时报错', () => {
  const schema = {
    fields: [{ name: 'project_number', type: 'select', required: true, optionSource: { type: 'static', options: [] } }],
  }
  const out = validateAgentRuntimeConfig({
    schema,
    agentConfig: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: 6,
      maxHistory: 20,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('optionSource.options 不能为空')))
})

test('select static options text/value 非法时报错', () => {
  const schema = {
    fields: [{
      name: 'project_number',
      type: 'select',
      required: true,
      optionSource: { type: 'static', options: [{ text: '', value: '' }] },
    }],
  }
  const out = validateAgentRuntimeConfig({
    schema,
    agentConfig: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: 6,
      maxHistory: 20,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('optionSource.options.text 非法')))
  assert.ok(out.errors.some((e) => e.includes('optionSource.options.value 非法')))
})

test('select static options value 重复时报错', () => {
  const schema = {
    fields: [{
      name: 'project_number',
      type: 'select',
      required: true,
      optionSource: { type: 'static', options: [{ text: 'P1', value: 'p1' }, { text: 'P-1', value: 'p1' }] },
    }],
  }
  const out = validateAgentRuntimeConfig({
    schema,
    agentConfig: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: 6,
      maxHistory: 20,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('optionSource.options.value 重复')))
})

test('schema 字段名重复时报错', () => {
  const schema = {
    fields: [
      { name: 'material_name', type: 'input', required: true },
      { name: 'material_name', type: 'select', required: false, optionSource: { type: 'static', options: [{ text: 'P1', value: 'p1' }] } },
    ],
  }
  const out = validateAgentRuntimeConfig({
    schema,
    agentConfig: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: 6,
      maxHistory: 20,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('字段名重复')))
})

test('schema 字段名格式非法时报错', () => {
  const schema = {
    fields: [
      { name: 'Bad-Name', type: 'input', required: true },
    ],
  }
  const out = validateAgentRuntimeConfig({
    schema,
    agentConfig: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: 6,
      maxHistory: 20,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('name 格式非法')))
})

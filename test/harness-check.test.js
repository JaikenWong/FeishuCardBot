const { test } = require('node:test')
const assert = require('node:assert')
const { runHarnessCheck } = require('../src/harness-check')

test('harness-check 正常配置通过', () => {
  const schema = { submit: { action: 'submit_create_part' }, fields: [{ name: 'material_name', type: 'input', required: true }] }
  const config = {
    allowedTools: ['list_field_options', 'prepare_create_part'],
    systemPrompt: 'sys',
    topicBoundary: '仅 PLM / 物料领域',
    maxSteps: 6,
    maxHistory: 20,
    maxToolArgsSize: 4096,
    maxToolCallsPerStep: 5,
    openaiMaxRetries: 1,
    callbackDedupeTtlMs: 300000,
    maxRequestsPerMinute: 20,
  }
  const out = runHarnessCheck({ schema, config })
  assert.strictEqual(out.ok, true)
})

test('harness-check 识别直接创建工具违规', () => {
  const schema = { submit: { action: 'submit_create_part' }, fields: [{ name: 'material_name', required: true }] }
  const config = { allowedTools: ['create_part'], systemPrompt: 'sys', topicBoundary: '仅 PLM / 物料领域', maxSteps: 6, maxHistory: 20, maxToolArgsSize: 4096, maxToolCallsPerStep: 5, openaiMaxRetries: 1, callbackDedupeTtlMs: 300000, maxRequestsPerMinute: 20 }
  const out = runHarnessCheck({ schema, config })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('禁止直接创建类 tool')))
})

test('harness-check 识别 submit action 违规', () => {
  const schema = { submit: { action: 'bad_action' }, fields: [{ name: 'material_name', required: true }] }
  const config = { allowedTools: ['list_field_options', 'prepare_create_part'], systemPrompt: 'sys', topicBoundary: '仅 PLM / 物料领域', maxSteps: 6, maxHistory: 20, maxToolArgsSize: 4096, maxToolCallsPerStep: 5, openaiMaxRetries: 1, callbackDedupeTtlMs: 300000, maxRequestsPerMinute: 20 }
  const out = runHarnessCheck({ schema, config })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('submit.action')))
})

test('harness-check 识别未知工具名', () => {
  const schema = { submit: { action: 'submit_create_part' }, fields: [{ name: 'material_name', required: true }] }
  const config = { allowedTools: ['list_field_options', 'not_exist_tool'], systemPrompt: 'sys', topicBoundary: '仅 PLM / 物料领域', maxSteps: 6, maxHistory: 20, maxToolArgsSize: 4096, maxToolCallsPerStep: 5, openaiMaxRetries: 1, callbackDedupeTtlMs: 300000, maxRequestsPerMinute: 20 }
  const out = runHarnessCheck({ schema, config })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('未知工具')))
})

test('harness-check 识别重复工具名', () => {
  const schema = { submit: { action: 'submit_create_part' }, fields: [{ name: 'material_name', required: true }] }
  const config = {
    allowedTools: ['list_field_options', 'prepare_create_part', 'list_field_options'],
    systemPrompt: 'sys',
    topicBoundary: '仅 PLM / 物料领域',
    maxSteps: 6,
    maxHistory: 20,
    maxToolArgsSize: 4096,
    maxToolCallsPerStep: 5,
    openaiMaxRetries: 1,
    callbackDedupeTtlMs: 300000,
    maxRequestsPerMinute: 20,
  }
  const out = runHarnessCheck({ schema, config })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('重复工具')))
})

test('harness-check 识别非法工具元素', () => {
  const schema = { submit: { action: 'submit_create_part' }, fields: [{ name: 'material_name', required: true }] }
  const config = {
    allowedTools: ['list_field_options', '', null, 'prepare_create_part'],
    systemPrompt: 'sys',
    topicBoundary: '仅 PLM / 物料领域',
    maxSteps: 6,
    maxHistory: 20,
    maxToolArgsSize: 4096,
    maxToolCallsPerStep: 5,
    openaiMaxRetries: 1,
    callbackDedupeTtlMs: 300000,
    maxRequestsPerMinute: 20,
  }
  const out = runHarnessCheck({ schema, config })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('仅允许非空字符串')))
})

test('harness-check 要求 list_field_options 在白名单', () => {
  const schema = { submit: { action: 'submit_create_part' }, fields: [{ name: 'material_name', required: true }] }
  const config = {
    allowedTools: ['prepare_create_part'],
    systemPrompt: 'sys',
    topicBoundary: '仅 PLM / 物料领域',
    maxSteps: 6,
    maxHistory: 20,
    maxToolArgsSize: 4096,
    maxToolCallsPerStep: 5,
    openaiMaxRetries: 1,
    callbackDedupeTtlMs: 300000,
    maxRequestsPerMinute: 20,
  }
  const out = runHarnessCheck({ schema, config })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('list_field_options')))
})

test('harness-check 要求 maxToolArgsSize 显式配置且合法', () => {
  const schema = { submit: { action: 'submit_create_part' }, fields: [{ name: 'material_name', required: true }] }
  const out1 = runHarnessCheck({
    schema,
    config: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      systemPrompt: 'sys',
      topicBoundary: '仅 PLM / 物料领域',
      maxSteps: 6,
      maxHistory: 20,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
      maxToolCallsPerStep: 5,
    },
  })
  assert.strictEqual(out1.ok, false)
  assert.ok(out1.errors.some((e) => e.includes('maxToolArgsSize 必须显式配置')))

  const out2 = runHarnessCheck({
    schema,
    config: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      systemPrompt: 'sys',
      topicBoundary: '仅 PLM / 物料领域',
      maxSteps: 6,
      maxHistory: 20,
      maxToolArgsSize: 10,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
      maxToolCallsPerStep: 5,
    },
  })
  assert.strictEqual(out2.ok, false)
  assert.ok(out2.errors.some((e) => e.includes('256-32768')))
})

test('harness-check 要求其他护栏显式配置且合法', () => {
  const schema = { submit: { action: 'submit_create_part' }, fields: [{ name: 'material_name', required: true }] }
  const outMissing = runHarnessCheck({
    schema,
    config: { allowedTools: ['list_field_options', 'prepare_create_part'], systemPrompt: 'sys', topicBoundary: '仅 PLM / 物料领域', maxSteps: 6, maxHistory: 20, maxToolArgsSize: 4096 },
  })
  assert.strictEqual(outMissing.ok, false)
  assert.ok(outMissing.errors.some((e) => e.includes('openaiMaxRetries')))
  assert.ok(outMissing.errors.some((e) => e.includes('callbackDedupeTtlMs')))
  assert.ok(outMissing.errors.some((e) => e.includes('maxRequestsPerMinute')))

  const outRange = runHarnessCheck({
    schema,
    config: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      systemPrompt: 'sys',
      topicBoundary: '仅 PLM / 物料领域',
      maxSteps: 6,
      maxHistory: 20,
      maxToolArgsSize: 4096,
      openaiMaxRetries: 9,
      callbackDedupeTtlMs: 1,
      maxRequestsPerMinute: 999,
      maxToolCallsPerStep: 99,
    },
  })
  assert.strictEqual(outRange.ok, false)
  assert.ok(outRange.errors.some((e) => e.includes('openaiMaxRetries')))
  assert.ok(outRange.errors.some((e) => e.includes('callbackDedupeTtlMs')))
  assert.ok(outRange.errors.some((e) => e.includes('maxRequestsPerMinute')))
  assert.ok(outRange.errors.some((e) => e.includes('maxToolCallsPerStep')))
})

test('harness-check 要求 maxSteps/maxHistory 显式配置且合法', () => {
  const schema = { submit: { action: 'submit_create_part' }, fields: [{ name: 'material_name', required: true }] }
  const outMissing = runHarnessCheck({
    schema,
    config: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      systemPrompt: 'sys',
      topicBoundary: '仅 PLM / 物料领域',
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
    },
  })
  assert.strictEqual(outMissing.ok, false)
  assert.ok(outMissing.errors.some((e) => e.includes('maxSteps')))
  assert.ok(outMissing.errors.some((e) => e.includes('maxHistory')))

  const outRange = runHarnessCheck({
    schema,
    config: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      systemPrompt: 'sys',
      topicBoundary: '仅 PLM / 物料领域',
      maxSteps: 99,
      maxHistory: 0,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
    },
  })
  assert.strictEqual(outRange.ok, false)
  assert.ok(outRange.errors.some((e) => e.includes('maxSteps')))
  assert.ok(outRange.errors.some((e) => e.includes('maxHistory')))
})

test('harness-check 要求 systemPrompt/topicBoundary 显式非空', () => {
  const schema = { submit: { action: 'submit_create_part' }, fields: [{ name: 'material_name', required: true }] }
  const outMissing = runHarnessCheck({
    schema,
    config: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: 6,
      maxHistory: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
    },
  })
  assert.strictEqual(outMissing.ok, false)
  assert.ok(outMissing.errors.some((e) => e.includes('systemPrompt')))
  assert.ok(outMissing.errors.some((e) => e.includes('topicBoundary')))

  const outEmpty = runHarnessCheck({
    schema,
    config: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      systemPrompt: ' ',
      topicBoundary: '',
      maxSteps: 6,
      maxHistory: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
    },
  })
  assert.strictEqual(outEmpty.ok, false)
  assert.ok(outEmpty.errors.some((e) => e.includes('systemPrompt')))
  assert.ok(outEmpty.errors.some((e) => e.includes('topicBoundary')))
})

test('harness-check 要求 schema.fields 为数组', () => {
  const out = runHarnessCheck({
    schema: { submit: { action: 'submit_create_part' } },
    config: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      systemPrompt: 'sys',
      topicBoundary: '仅 PLM / 物料领域',
      maxSteps: 6,
      maxHistory: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('schema.fields 必须是数组')))
})

test('harness-check 识别 schema 字段名重复', () => {
  const out = runHarnessCheck({
    schema: {
      submit: { action: 'submit_create_part' },
      fields: [
        { name: 'material_name', type: 'input', required: true },
        { name: 'material_name', type: 'select', required: true },
      ],
    },
    config: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      systemPrompt: 'sys',
      topicBoundary: '仅 PLM / 物料领域',
      maxSteps: 6,
      maxHistory: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('字段名重复')))
})

test('harness-check 识别 schema 字段 type 非法', () => {
  const out = runHarnessCheck({
    schema: {
      submit: { action: 'submit_create_part' },
      fields: [{ name: 'material_name', type: 'text', required: true }],
    },
    config: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      systemPrompt: 'sys',
      topicBoundary: '仅 PLM / 物料领域',
      maxSteps: 6,
      maxHistory: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('type 非法')))
})

test('harness-check 识别 select 缺 optionSource', () => {
  const out = runHarnessCheck({
    schema: {
      submit: { action: 'submit_create_part' },
      fields: [{ name: 'project_number', type: 'select', required: true }],
    },
    config: {
      allowedTools: ['list_field_options', 'prepare_create_part'],
      systemPrompt: 'sys',
      topicBoundary: '仅 PLM / 物料领域',
      maxSteps: 6,
      maxHistory: 20,
      maxToolArgsSize: 4096,
      maxToolCallsPerStep: 5,
      openaiMaxRetries: 1,
      callbackDedupeTtlMs: 300000,
      maxRequestsPerMinute: 20,
    },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('select 时必须配置 optionSource')))
})

const { test } = require('node:test')
const assert = require('node:assert')
const path = require('path')
const { createAgent } = require('../src/agent')
const { loadReplayFixture, runReplay, assertReplay, summarizeReplayResults, validateReplayFixture } = require('../src/replay')

function fakeOpenAI(responses) {
  let i = 0
  return {
    chat: {
      completions: {
        create: async () => {
          const item = responses[i++]
          if (item && item.__throw) throw new Error(item.message || 'mock openai error')
          return item
        },
      },
    },
  }
}

test('replay fixture 回放通过', async () => {
  const fixture = loadReplayFixture(path.join(__dirname, 'fixtures', 'replay-basic.json'))
  const openai = fakeOpenAI([
    { choices: [{ message: { content: '仅支持仅 PLM / 物料领域问题。请描述要创建或查询的物料信息。' } }] },
    { choices: [{ message: { content: null, tool_calls: [{ id: 't1', function: { name: 'list_field_options', arguments: JSON.stringify({ field: 'project_number' }) } }] } }] },
    { choices: [{ message: { content: '项目号可选 P1' } }] },
    { choices: [{ message: { content: null, tool_calls: [{ id: 't2', function: { name: 'prepare_create_part', arguments: JSON.stringify({ values: { material_name: '板', project_number: 'p1' } }) } }] } }] },
  ])
  const agent = createAgent({
    openai,
    plmClient: { getProjectOptions: async () => [{ text: 'P1', value: 'p1' }] },
    config: { model: 'm', systemPrompt: 'sys', allowedTools: ['list_field_options', 'prepare_create_part'], maxSteps: 6, maxHistory: 20 },
    schema: { fields: [{ name: 'material_name', required: true }, { name: 'project_number', required: true }] },
  })
  const results = await runReplay({ fixture, agent })
  const check = assertReplay(results, fixture)
  assert.strictEqual(check.ok, true)
})

test('replay timeout fixture 命中超时降级', async () => {
  const fixture = loadReplayFixture(path.join(__dirname, 'fixtures', 'replay-timeout.json'))
  const openai = fakeOpenAI(fixture.mockResponses)
  const agent = createAgent({
    openai,
    plmClient: { getProjectOptions: async () => [{ text: 'P1', value: 'p1' }] },
    config: { model: 'm', systemPrompt: 'sys', allowedTools: ['list_field_options', 'prepare_create_part'], maxSteps: 2, maxHistory: 20 },
    schema: { fields: [{ name: 'material_name', required: true }, { name: 'project_number', required: true }] },
  })
  const results = await runReplay({ fixture, agent })
  const check = assertReplay(results, fixture)
  assert.strictEqual(check.ok, true)
})

test('replay openai error fixture 命中服务降级', async () => {
  const fixture = loadReplayFixture(path.join(__dirname, 'fixtures', 'replay-openai-error.json'))
  const openai = fakeOpenAI(fixture.mockResponses)
  const agent = createAgent({
    openai,
    plmClient: { getProjectOptions: async () => [{ text: 'P1', value: 'p1' }] },
    config: {
      model: 'm',
      systemPrompt: 'sys',
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: 6,
      maxHistory: 20,
      openaiMaxRetries: fixture.openaiMaxRetries,
    },
    schema: { fields: [{ name: 'material_name', required: true }, { name: 'project_number', required: true }] },
  })
  const results = await runReplay({ fixture, agent })
  const check = assertReplay(results, fixture)
  assert.strictEqual(check.ok, true)
})

test('replay unknown-tool fixture 命中超时降级', async () => {
  const fixture = loadReplayFixture(path.join(__dirname, 'fixtures', 'replay-unknown-tool.json'))
  const openai = fakeOpenAI(fixture.mockResponses)
  const agent = createAgent({
    openai,
    plmClient: { getProjectOptions: async () => [{ text: 'P1', value: 'p1' }] },
    config: { model: 'm', systemPrompt: 'sys', allowedTools: ['list_field_options', 'prepare_create_part'], maxSteps: 1, maxHistory: 20 },
    schema: { fields: [{ name: 'material_name', required: true }, { name: 'project_number', required: true }] },
  })
  const results = await runReplay({ fixture, agent })
  const check = assertReplay(results, fixture)
  assert.strictEqual(check.ok, true)
})

test('replay bad-args fixture 命中超时降级', async () => {
  const fixture = loadReplayFixture(path.join(__dirname, 'fixtures', 'replay-bad-args.json'))
  const openai = fakeOpenAI(fixture.mockResponses)
  const agent = createAgent({
    openai,
    plmClient: { getProjectOptions: async () => [{ text: 'P1', value: 'p1' }] },
    config: { model: 'm', systemPrompt: 'sys', allowedTools: ['list_field_options', 'prepare_create_part'], maxSteps: 1, maxHistory: 20 },
    schema: { fields: [{ name: 'material_name', required: true }, { name: 'project_number', required: true }] },
  })
  const results = await runReplay({ fixture, agent })
  const check = assertReplay(results, fixture)
  assert.strictEqual(check.ok, true)
})

test('replay mixed-failure fixture 命中服务降级', async () => {
  const fixture = loadReplayFixture(path.join(__dirname, 'fixtures', 'replay-mixed-failure.json'))
  const openai = fakeOpenAI(fixture.mockResponses)
  const agent = createAgent({
    openai,
    plmClient: { getProjectOptions: async () => [{ text: 'P1', value: 'p1' }] },
    config: {
      model: 'm',
      systemPrompt: 'sys',
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: fixture.maxSteps,
      maxHistory: 20,
      openaiMaxRetries: fixture.openaiMaxRetries,
    },
    schema: { fields: [{ name: 'material_name', required: true }, { name: 'project_number', required: true }] },
  })
  const results = await runReplay({ fixture, agent })
  const check = assertReplay(results, fixture)
  assert.strictEqual(check.ok, true)
})

test('replay multi-tools-one-invalid fixture 命中超时降级', async () => {
  const fixture = loadReplayFixture(path.join(__dirname, 'fixtures', 'replay-multi-tools-one-invalid.json'))
  const openai = fakeOpenAI(fixture.mockResponses)
  const agent = createAgent({
    openai,
    plmClient: { getProjectOptions: async () => [{ text: 'P1', value: 'p1' }] },
    config: {
      model: 'm',
      systemPrompt: 'sys',
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: fixture.maxSteps,
      maxHistory: 20,
    },
    schema: { fields: [{ name: 'material_name', required: true }, { name: 'project_number', required: true }] },
  })
  const results = await runReplay({ fixture, agent })
  const check = assertReplay(results, fixture)
  assert.strictEqual(check.ok, true)
})

test('replay card-then-invalid-tool fixture 仍返回确认卡片', async () => {
  const fixture = loadReplayFixture(path.join(__dirname, 'fixtures', 'replay-card-then-invalid-tool.json'))
  const openai = fakeOpenAI(fixture.mockResponses)
  const agent = createAgent({
    openai,
    plmClient: { getProjectOptions: async () => [{ text: 'P1', value: 'p1' }] },
    config: {
      model: 'm',
      systemPrompt: 'sys',
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: fixture.maxSteps,
      maxHistory: 20,
    },
    schema: { fields: [{ name: 'material_name', required: true }, { name: 'project_number', required: true }] },
  })
  const results = await runReplay({ fixture, agent })
  const check = assertReplay(results, fixture)
  assert.strictEqual(check.ok, true)
})

test('replay long-args fixture 命中超时降级', async () => {
  const fixture = loadReplayFixture(path.join(__dirname, 'fixtures', 'replay-long-args.json'))
  const openai = fakeOpenAI(fixture.mockResponses)
  const agent = createAgent({
    openai,
    plmClient: { getProjectOptions: async () => [{ text: 'P1', value: 'p1' }] },
    config: {
      model: 'm',
      systemPrompt: 'sys',
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: fixture.maxSteps,
      maxHistory: 20,
    },
    schema: { fields: [{ name: 'material_name', required: true }, { name: 'project_number', required: true }] },
  })
  const results = await runReplay({ fixture, agent })
  const check = assertReplay(results, fixture)
  assert.strictEqual(check.ok, true)
})

test('replay unknown-values-field fixture 命中超时降级', async () => {
  const fixture = loadReplayFixture(path.join(__dirname, 'fixtures', 'replay-unknown-values-field.json'))
  const openai = fakeOpenAI(fixture.mockResponses)
  const agent = createAgent({
    openai,
    plmClient: { getProjectOptions: async () => [{ text: 'P1', value: 'p1' }] },
    config: {
      model: 'm',
      systemPrompt: 'sys',
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: fixture.maxSteps,
      maxHistory: 20,
    },
    schema: { fields: [{ name: 'material_name', required: true }, { name: 'project_number', required: true }] },
  })
  const results = await runReplay({ fixture, agent })
  const check = assertReplay(results, fixture)
  assert.strictEqual(check.ok, true)
})

test('replay values-array fixture 命中超时降级', async () => {
  const fixture = loadReplayFixture(path.join(__dirname, 'fixtures', 'replay-values-array.json'))
  const openai = fakeOpenAI(fixture.mockResponses)
  const agent = createAgent({
    openai,
    plmClient: { getProjectOptions: async () => [{ text: 'P1', value: 'p1' }] },
    config: {
      model: 'm',
      systemPrompt: 'sys',
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: fixture.maxSteps,
      maxHistory: 20,
    },
    schema: { fields: [{ name: 'material_name', required: true }, { name: 'project_number', required: true }] },
  })
  const results = await runReplay({ fixture, agent })
  const check = assertReplay(results, fixture)
  assert.strictEqual(check.ok, true)
})

test('replay tool-args-too-large fixture 命中超时降级', async () => {
  const fixture = loadReplayFixture(path.join(__dirname, 'fixtures', 'replay-tool-args-too-large.json'))
  const openai = fakeOpenAI(fixture.mockResponses)
  const agent = createAgent({
    openai,
    plmClient: { getProjectOptions: async () => [{ text: 'P1', value: 'p1' }] },
    config: {
      model: 'm',
      systemPrompt: 'sys',
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: fixture.maxSteps,
      maxHistory: 20,
      maxToolArgsSize: fixture.maxToolArgsSize,
    },
    schema: { fields: [{ name: 'material_name', required: true }, { name: 'project_number', required: true }] },
  })
  const results = await runReplay({ fixture, agent })
  const check = assertReplay(results, fixture)
  assert.strictEqual(check.ok, true)
})

test('summarizeReplayResults 分类统计', () => {
  const summary = summarizeReplayResults([
    { out: { cardAction: { type: 'confirm_create' } } },
    { out: { reply: '处理超时，请简化你的请求后重试' } },
    { out: { reply: '服务暂不可用，请稍后再试' } },
    { out: { reply: '项目号可选 P1' } },
    { out: {} },
  ])
  assert.deepStrictEqual(summary, {
    total: 5,
    cardAction: 1,
    timeout: 1,
    serviceUnavailable: 1,
    otherReply: 1,
    empty: 1,
  })
})

test('validateReplayFixture 对坏结构 fail-fast', () => {
  assert.throws(
    () => validateReplayFixture({ turns: [{ user: 'u1', expect: { type: 'reply' } }] }),
    /name must be non-empty string/
  )
  assert.throws(
    () => validateReplayFixture({ name: 'x', turns: [] }),
    /turns must be non-empty array/
  )
  assert.throws(
    () => validateReplayFixture({ name: 'x', turns: [{ user: '', expect: { type: 'reply' } }] }),
    /turns\[0\]\.user must be non-empty string/
  )
  assert.throws(
    () => validateReplayFixture({ name: 'x', turns: [{ user: 'u1' }] }),
    /turns\[0\]\.expect must be object/
  )
  assert.throws(
    () => validateReplayFixture({ name: 'x', turns: [{ user: 'u1', expect: { type: 'x' } }] }),
    /expect\.type must be reply\|cardAction/
  )
  assert.throws(
    () => validateReplayFixture({ name: 'x', turns: [{ user: 'u1', expect: { type: 'reply', typo: 'x' } }] }),
    /expect has unknown keys/
  )
  assert.throws(
    () => validateReplayFixture({ name: 'x', turns: [{ user: 'u1', expect: { type: 'reply', actionType: 'confirm_create' } }] }),
    /actionType only allowed for cardAction/
  )
  assert.throws(
    () => validateReplayFixture({ name: 'x', turns: [{ user: 'u1', expect: { type: 'reply', notCardAction: false } }] }),
    /expect\.notCardAction must be true/
  )
})

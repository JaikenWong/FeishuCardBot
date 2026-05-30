const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createAgent } = require('../src/agent')

const schema = { fields: [
  { name: 'material_name', type: 'input', label: '物料名称', required: true },
  { name: 'project_number', type: 'select', label: '项目号', required: true,
    optionSource: { type: 'static', options: [{ text: 'P1', value: 'p1' }] } },
] }
const config = { model: 'm', systemPrompt: 'sys', allowedTools: ['list_field_options', 'prepare_create_part'], maxSteps: 6, maxHistory: 20 }

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-')) }

// 脚本化 OpenAI：按调用次序返回预设响应
function fakeOpenAI(responses) {
  let i = 0
  return { chat: { completions: { create: async () => responses[i++] } } }
}

test('纯文本回复直接返回 reply', async () => {
  const openai = fakeOpenAI([{ choices: [{ message: { content: '你好，要建什么物料？' } }] }])
  const agent = createAgent({ openai, plmClient: {}, config, schema, memoryDir: tmpDir() })
  const out = await agent.run('u1', '在吗')
  assert.strictEqual(out.reply, '你好，要建什么物料？')
})

test('tool_call→执行→终答', async () => {
  const openai = fakeOpenAI([
    { choices: [{ message: { content: null, tool_calls: [
      { id: 't1', function: { name: 'list_field_options', arguments: JSON.stringify({ field: 'project_number' }) } },
    ] } }] },
    { choices: [{ message: { content: '项目号可选 P1' } }] },
  ])
  const agent = createAgent({ openai, plmClient: {}, config, schema, memoryDir: tmpDir() })
  const out = await agent.run('u1', '有哪些项目号')
  assert.strictEqual(out.reply, '项目号可选 P1')
})

test('prepare_create_part 返回 cardAction', async () => {
  const values = { material_name: '板', project_number: 'p1' }
  const openai = fakeOpenAI([
    { choices: [{ message: { content: null, tool_calls: [
      { id: 't1', function: { name: 'prepare_create_part', arguments: JSON.stringify({ values }) } },
    ] } }] },
  ])
  const agent = createAgent({ openai, plmClient: {}, config, schema, memoryDir: tmpDir() })
  const out = await agent.run('u1', '建好了')
  assert.deepStrictEqual(out.cardAction, { type: 'confirm_create', values })
})

test('OpenAI 抛错返回降级提示', async () => {
  const openai = { chat: { completions: { create: async () => { throw new Error('boom') } } } }
  const agent = createAgent({ openai, plmClient: {}, config, schema, memoryDir: tmpDir() })
  const out = await agent.run('u1', 'x')
  assert.match(out.reply, /服务暂不可用/)
})

test('maxSteps 用尽返回降级提示', async () => {
  // 每次都返回同一个 tool_call，永不收敛
  const openai = { chat: { completions: { create: async () => ({
    choices: [{ message: { content: null, tool_calls: [
      { id: 't1', function: { name: 'list_field_options', arguments: JSON.stringify({ field: 'project_number' }) } },
    ] } }] }) } } }
  const cfg = { ...config, maxSteps: 2 }
  const agent = createAgent({ openai, plmClient: {}, config: cfg, schema, memoryDir: tmpDir() })
  const out = await agent.run('u1', 'loop')
  assert.match(out.reply, /超时|重试/)
})

test('记忆持久化 user+assistant 文本', async () => {
  const dir = tmpDir()
  const openai = fakeOpenAI([{ choices: [{ message: { content: '收到' } }] }])
  const agent = createAgent({ openai, plmClient: {}, config, schema, memoryDir: dir })
  await agent.run('u9', '你好')
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'u9.json'), 'utf8'))
  assert.deepStrictEqual(saved, [
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '收到' },
  ])
})

test('trace 记录关键事件', async () => {
  const events = []
  const openai = fakeOpenAI([{ choices: [{ message: { content: 'ok' } }] }])
  const agent = createAgent({
    openai,
    plmClient: {},
    config,
    schema,
    memoryDir: tmpDir(),
    trace: (event) => events.push(event),
  })
  await agent.run('u1', 'hi', { requestId: 'r1' })
  assert.ok(events.includes('agent.run.start'))
  assert.ok(events.includes('agent.step.start'))
  assert.ok(events.includes('agent.step.final_reply'))
  assert.ok(events.includes('agent.run.end'))
})

test('trace payload 带 requestId', async () => {
  const events = []
  const openai = fakeOpenAI([{ choices: [{ message: { content: 'ok' } }] }])
  const agent = createAgent({
    openai,
    plmClient: {},
    config,
    schema,
    memoryDir: tmpDir(),
    trace: (event, payload) => events.push({ event, payload }),
  })
  await agent.run('u1', 'hi', { requestId: 'rid_1' })
  const start = events.find((e) => e.event === 'agent.run.start')
  assert.strictEqual(start.payload.requestId, 'rid_1')
})

test('OpenAI 瞬时失败后重试成功', async () => {
  let n = 0
  const openai = {
    chat: {
      completions: {
        create: async () => {
          n += 1
          if (n === 1) throw new Error('temporary')
          return { choices: [{ message: { content: '重试成功' } }] }
        },
      },
    },
  }
  const events = []
  const cfg = { ...config, openaiMaxRetries: 1 }
  const agent = createAgent({ openai, plmClient: {}, config: cfg, schema, memoryDir: tmpDir(), trace: (e) => events.push(e) })
  const out = await agent.run('u1', 'x')
  assert.strictEqual(out.reply, '重试成功')
  assert.ok(events.includes('agent.openai.retry'))
})

test('OpenAI 重试耗尽返回降级', async () => {
  const openai = { chat: { completions: { create: async () => { throw new Error('down') } } } }
  const cfg = { ...config, openaiMaxRetries: 1 }
  const agent = createAgent({ openai, plmClient: {}, config: cfg, schema, memoryDir: tmpDir() })
  const out = await agent.run('u1', 'x')
  assert.match(out.reply, /服务暂不可用/)
})

test('agent 内部输出契约守卫：未知 cardAction 降级', async () => {
  const openai = fakeOpenAI([
    { choices: [{ message: { content: null, tool_calls: [
      { id: 't1', function: { name: 'prepare_create_part', arguments: JSON.stringify({ values: { material_name: '板', project_number: 'p1' } }) } },
    ] } }] },
  ])
  const badTools = {
    getToolDefinitions: () => [],
    executeTool: async () => ({ cardAction: { type: 'other_action' } }),
  }
  const agent = createAgent({ openai, plmClient: {}, config, schema, memoryDir: tmpDir(), toolsMod: badTools })
  const out = await agent.run('u1', 'x')
  assert.match(out.reply, /服务暂不可用/)
})

test('拿到 cardAction 后停止执行后续 tool_call', async () => {
  const openai = fakeOpenAI([
    { choices: [{ message: { content: null, tool_calls: [
      { id: 't1', function: { name: 'prepare_create_part', arguments: JSON.stringify({ values: { material_name: '板', project_number: 'p1' } }) } },
      { id: 't2', function: { name: 'list_field_options', arguments: JSON.stringify({ field: 'project_number' }) } },
    ] } }] },
  ])
  const calls = []
  const toolsSpy = {
    getToolDefinitions: () => [],
    executeTool: async (name) => {
      calls.push(name)
      if (name === 'prepare_create_part') return { cardAction: { type: 'confirm_create', values: { material_name: '板', project_number: 'p1' } } }
      return { result: [] }
    },
  }
  const agent = createAgent({ openai, plmClient: {}, config, schema, memoryDir: tmpDir(), toolsMod: toolsSpy })
  const out = await agent.run('u1', 'x')
  assert.strictEqual(out.cardAction.type, 'confirm_create')
  assert.deepStrictEqual(calls, ['prepare_create_part'])
})

test('agent.tool.error payload 含 toolArgsSize', async () => {
  const events = []
  const argsText = JSON.stringify({ field: 'project_number' })
  const openai = fakeOpenAI([
    { choices: [{ message: { content: null, tool_calls: [
      { id: 't1', function: { name: 'list_field_options', arguments: argsText } },
    ] } }] },
  ])
  const badTools = {
    getToolDefinitions: () => [],
    executeTool: async () => { throw new Error('boom') },
  }
  const agent = createAgent({
    openai,
    plmClient: {},
    config: { ...config, maxSteps: 1 },
    schema,
    memoryDir: tmpDir(),
    toolsMod: badTools,
    trace: (event, payload) => events.push({ event, payload }),
  })
  await agent.run('u1', 'x', { requestId: 'rid_x' })
  const errEvt = events.find((e) => e.event === 'agent.tool.error')
  assert.ok(errEvt)
  assert.strictEqual(errEvt.payload.toolArgsSize, argsText.length)
})

test('tool arguments 超限时触发 args_too_large 并降级', async () => {
  const events = []
  const longArgs = JSON.stringify({ field: 'x'.repeat(80) })
  const openai = fakeOpenAI([
    { choices: [{ message: { content: null, tool_calls: [
      { id: 't1', function: { name: 'list_field_options', arguments: longArgs } },
    ] } }] },
  ])
  const agent = createAgent({
    openai,
    plmClient: {},
    config: { ...config, maxSteps: 1, maxToolArgsSize: 20 },
    schema,
    memoryDir: tmpDir(),
    trace: (event, payload) => events.push({ event, payload }),
  })
  const out = await agent.run('u1', 'x', { requestId: 'rid_y' })
  assert.match(out.reply, /超时|重试/)
  const tooLarge = events.find((e) => e.event === 'agent.tool.args_too_large')
  assert.ok(tooLarge)
  assert.strictEqual(tooLarge.payload.limit, 20)
})

test('tool_calls 超限时仅执行前 N 个并记录 truncated', async () => {
  const events = []
  const openai = fakeOpenAI([
    {
      choices: [{
        message: {
          content: null,
          tool_calls: [
            { id: 't1', function: { name: 'list_field_options', arguments: JSON.stringify({ field: 'project_number' }) } },
            { id: 't2', function: { name: 'list_field_options', arguments: JSON.stringify({ field: 'project_number' }) } },
            { id: 't3', function: { name: 'list_field_options', arguments: JSON.stringify({ field: 'project_number' }) } },
          ],
        },
      }],
    },
  ])
  const calls = []
  const toolsSpy = {
    getToolDefinitions: () => [],
    executeTool: async (name) => {
      calls.push(name)
      return { result: [] }
    },
  }
  const agent = createAgent({
    openai,
    plmClient: {},
    config: { ...config, maxSteps: 1, maxToolCallsPerStep: 2 },
    schema,
    memoryDir: tmpDir(),
    toolsMod: toolsSpy,
    trace: (event, payload) => events.push({ event, payload }),
  })
  await agent.run('u1', 'x', { requestId: 'rid_z' })
  assert.strictEqual(calls.length, 2)
  const evt = events.find((e) => e.event === 'agent.tool_calls.truncated')
  assert.ok(evt)
  assert.strictEqual(evt.payload.originalCount, 3)
  assert.strictEqual(evt.payload.allowedCount, 2)
})

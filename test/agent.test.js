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
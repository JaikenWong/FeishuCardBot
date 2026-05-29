const { test } = require('node:test')
const assert = require('node:assert')
const { createAgent } = require('../src/agent')
const { createHandlers } = require('../src/handlers')

function fakeOpenAIQueue(responses) {
  let i = 0
  return {
    chat: {
      completions: {
        create: async () => responses[i++],
      },
    },
  }
}

function makeHarness({ openaiResponses, plmClient } = {}) {
  const schema = {
    fields: [
      { name: 'material_name', type: 'input', label: '物料名称', required: true },
      { name: 'project_number', type: 'select', label: '项目号', required: true, optionSource: { type: 'static', options: [{ text: 'P1', value: 'p1' }] } },
    ],
  }
  const config = {
    model: 'm',
    systemPrompt: 'sys',
    allowedTools: ['list_field_options', 'prepare_create_part'],
    maxSteps: 6,
    maxHistory: 20,
    openaiMaxRetries: 1,
    callbackDedupeTtlMs: 1000,
  }
  const sent = []
  const created = []
  const history = []

  const agent = createAgent({
    openai: fakeOpenAIQueue(openaiResponses || []),
    plmClient: plmClient || { getProjectOptions: async () => [{ text: 'P1', value: 'p1' }] },
    config,
    schema,
  })

  const handlers = createHandlers({
    agent,
    client: { im: { message: { create: async (payload) => { sent.push(payload); return { data: { message_id: 'm1' } } } } } },
    buildCreatePartCard: async (values) => ({ mockCard: true, values }),
    buildResultCard: (result) => ({ result }),
    createPart: async (formData) => { created.push(formData); return { success: true, data: formData } },
    appendHistory: (...args) => history.push(args),
    maxHistory: config.maxHistory,
    topicBoundary: '仅 PLM / 物料领域',
    schema,
    callbackDedupeTtlMs: config.callbackDedupeTtlMs,
    logger: { log: () => {}, error: () => {} },
  })

  return { handlers, sent, created, history }
}

test('harness: 无关话题被拒答', async () => {
  const { handlers, sent } = makeHarness({ openaiResponses: [] })
  await handlers.handleMessage({
    event: {
      sender: { sender_id: { open_id: 'ou_1' } },
      message: { chat_id: 'oc_1', content: JSON.stringify({ text: '今天天气如何' }) },
    },
  })
  assert.strictEqual(sent.length, 1)
  assert.strictEqual(sent[0].data.msg_type, 'text')
})

test('harness: 查询项目号走 tool_call 再终答', async () => {
  const { handlers, sent } = makeHarness({
    openaiResponses: [
      { choices: [{ message: { content: null, tool_calls: [{ id: 't1', function: { name: 'list_field_options', arguments: JSON.stringify({ field: 'project_number' }) } }] } }] },
      { choices: [{ message: { content: '项目号可选 P1' } }] },
    ],
  })
  await handlers.handleMessage({
    event: {
      sender: { sender_id: { open_id: 'ou_2' } },
      message: { chat_id: 'oc_2', content: JSON.stringify({ text: '有哪些项目号' }) },
    },
  })
  assert.strictEqual(sent.length, 1)
  assert.match(sent[0].data.content, /项目号可选 P1/)
})

test('harness: 建料确认卡片 + 回调幂等', async () => {
  const values = { material_name: '板', project_number: 'p1' }
  const { handlers, sent, created } = makeHarness({
    openaiResponses: [
      { choices: [{ message: { content: null, tool_calls: [{ id: 't1', function: { name: 'prepare_create_part', arguments: JSON.stringify({ values }) } }] } }] },
    ],
  })

  await handlers.handleMessage({
    event: {
      sender: { sender_id: { open_id: 'ou_3' } },
      message: { chat_id: 'oc_3', content: JSON.stringify({ text: '开始建料' }) },
    },
  })
  assert.strictEqual(sent.length, 1)
  assert.strictEqual(sent[0].data.msg_type, 'interactive')

  const callbackPayload = {
    operator: { open_id: 'ou_3' },
    action: { action_type: 'form_submit', form_value: values },
  }
  await handlers.handleCardCallback(callbackPayload)
  await handlers.handleCardCallback(callbackPayload)
  assert.strictEqual(created.length, 1)
})

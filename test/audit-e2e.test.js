const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createAgent } = require('../src/agent')
const { createHandlers } = require('../src/handlers')
const { createAuditLogger } = require('../src/audit-log')

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-e2e-'))
  return path.join(dir, 'audit.jsonl')
}

test('同一消息链路 requestId 在 handler 与 agent trace 一致', async () => {
  const file = tmpFile()
  const audit = createAuditLogger({ filePath: file, now: () => '2026-01-01T00:00:00.000Z' })
  const schema = { fields: [{ name: 'material_name', type: 'input', required: true }] }
  const config = { model: 'm', systemPrompt: 'sys', allowedTools: ['list_field_options', 'prepare_create_part'], maxSteps: 2, maxHistory: 20 }

  const openai = {
    chat: { completions: { create: async () => ({ choices: [{ message: { content: '收到' } }] }) } },
  }

  const agent = createAgent({ openai, plmClient: {}, config, schema, trace: audit.trace })
  const client = { im: { message: { create: async () => ({ data: { message_id: 'm1' } }) } } }

  const handlers = createHandlers({
    agent,
    client,
    buildCreatePartCard: async () => ({}),
    buildResultCard: () => ({}),
    createPart: async () => ({ success: true, data: {} }),
    appendHistory: () => {},
    maxHistory: 20,
    topicBoundary: '仅 PLM / 物料领域',
    schema,
    trace: audit.trace,
    requestIdFactory: () => 'msg_fixed_1',
    logger: { log: () => {}, error: () => {} },
  })

  await handlers.handleMessage({
    event: {
      sender: { sender_id: { open_id: 'ou_1' } },
      message: { chat_id: 'oc_1', content: JSON.stringify({ text: '创建物料' }) },
    },
  })

  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map((x) => JSON.parse(x))
  const reqEvents = lines.filter((x) => x.payload && x.payload.requestId === 'msg_fixed_1')
  assert.ok(reqEvents.some((x) => x.event === 'handler.message.agent_run'))
  assert.ok(reqEvents.some((x) => x.event === 'agent.run.start'))
  assert.ok(reqEvents.some((x) => x.event === 'agent.run.end'))
})

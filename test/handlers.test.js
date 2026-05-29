const { test } = require('node:test')
const assert = require('node:assert')
const { createHandlers, createRequestId } = require('../src/handlers')
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

function fakeDeps(overrides = {}) {
  const sent = []
  const history = []
  const deps = {
    agent: { run: async () => ({ reply: 'ok' }) },
    client: { im: { message: { create: async (payload) => { sent.push(payload); return { data: { message_id: 'm1' } } } } } },
    buildCreatePartCard: async (v) => ({ card: true, v }),
    buildResultCard: (r) => ({ result: r.success }),
    createPart: async () => ({ success: true, data: {} }),
    appendHistory: (...args) => history.push(args),
    maxHistory: 20,
    schema: { fields: [{ name: 'material_name', required: true }, { name: 'project_number', required: true }] },
    logger: { log: () => {}, error: () => {} },
    ...overrides,
  }
  return { deps, sent, history }
}

test('handleMessage 文本回复路径', async () => {
  const { deps, sent } = fakeDeps({
    agent: { run: async () => ({ reply: '收到' }) },
  })
  const h = createHandlers(deps)
  await h.handleMessage({ event: { sender: { sender_id: { open_id: 'ou_1' } }, message: { chat_id: 'oc_1', content: JSON.stringify({ text: 'hi' }) } } })
  assert.strictEqual(sent.length, 1)
  assert.strictEqual(sent[0].data.msg_type, 'text')
})

test('handleMessage confirm_create 路径发卡片', async () => {
  const { deps, sent } = fakeDeps({
    agent: { run: async () => ({ cardAction: { type: 'confirm_create', values: { material_name: '板' } } }) },
  })
  const h = createHandlers(deps)
  await h.handleMessage({ event: { sender: { sender_id: { open_id: 'ou_1' } }, message: { chat_id: 'oc_1', content: JSON.stringify({ text: '建料' }) } } })
  assert.strictEqual(sent.length, 1)
  assert.strictEqual(sent[0].data.msg_type, 'interactive')
})

test('handleMessage 无关话题直接拒绝且不调 agent', async () => {
  let called = 0
  const { deps, sent } = fakeDeps({
    agent: { run: async () => { called++; return { reply: 'nope' } } },
  })
  const h = createHandlers(deps)
  await h.handleMessage({ event: { sender: { sender_id: { open_id: 'ou_1' } }, message: { chat_id: 'oc_1', content: JSON.stringify({ text: '今天天气如何' }) } } })
  assert.strictEqual(called, 0)
  assert.strictEqual(sent.length, 1)
  assert.strictEqual(sent[0].data.msg_type, 'text')
  assert.match(sent[0].data.content, /仅支持/)
})

test('handleCardCallback submit 后创建并写记忆', async () => {
  const { deps, sent, history } = fakeDeps({
    createPart: async () => ({ success: true, data: {} }),
  })
  const h = createHandlers(deps)
  await h.handleCardCallback({
    operator: { open_id: 'ou_9' },
    action: { action_type: 'form_submit', form_value: { material_name: '板' } },
  })
  assert.strictEqual(sent.length, 1)
  assert.strictEqual(sent[0].params.receive_id_type, 'open_id')
  assert.strictEqual(history.length, 1)
  assert.strictEqual(history[0][0], 'ou_9')
})

test('handleCardCallback 非 submit 忽略', async () => {
  const { deps, sent, history } = fakeDeps()
  const h = createHandlers(deps)
  await h.handleCardCallback({ operator: { open_id: 'ou_9' }, action: { action_type: 'button' } })
  assert.strictEqual(sent.length, 0)
  assert.strictEqual(history.length, 0)
})

test('handleCardCallback 缺必填不调用 createPart', async () => {
  let called = 0
  const { deps, sent, history } = fakeDeps({
    createPart: async () => { called++; return { success: true, data: {} } },
  })
  const h = createHandlers(deps)
  await h.handleCardCallback({
    operator: { open_id: 'ou_8' },
    action: { action_type: 'form_submit', form_value: { material_name: '板' } },
  })
  assert.strictEqual(called, 0)
  assert.strictEqual(sent.length, 1)
  assert.strictEqual(sent[0].params.receive_id_type, 'open_id')
  assert.strictEqual(history.length, 1)
  assert.match(history[0][1][0].content, /缺少必填字段/)
})

test('trace 记录无关话题拒绝事件', async () => {
  const events = []
  const { deps } = fakeDeps({
    trace: (event) => events.push(event),
  })
  const h = createHandlers(deps)
  await h.handleMessage({ event: { sender: { sender_id: { open_id: 'ou_1' } }, message: { chat_id: 'oc_1', content: JSON.stringify({ text: '天气如何' }) } } })
  assert.ok(events.includes('handler.message.rejected'))
})

test('createRequestId 生成带前缀 ID', () => {
  const id = createRequestId('msg')
  assert.match(id, /^msg_/)
})

test('handleMessage 调 agent 传 requestId', async () => {
  let reqMeta = null
  const { deps } = fakeDeps({
    agent: {
      run: async (_openId, _text, meta) => {
        reqMeta = meta
        return { reply: 'ok' }
      },
    },
  })
  const h = createHandlers(deps)
  await h.handleMessage({ event: { sender: { sender_id: { open_id: 'ou_1' } }, message: { chat_id: 'oc_1', content: JSON.stringify({ text: '建料' }) } } })
  assert.ok(reqMeta && reqMeta.requestId)
})

test('agent 输出非法结构时返回降级文案', async () => {
  const { deps, sent } = fakeDeps({
    agent: { run: async () => ({}) },
  })
  const h = createHandlers(deps)
  await h.handleMessage({
    event: {
      sender: { sender_id: { open_id: 'ou_bad' } },
      message: { chat_id: 'oc_bad', content: JSON.stringify({ text: '建料' }) },
    },
  })
  assert.strictEqual(sent.length, 1)
  assert.strictEqual(sent[0].data.msg_type, 'text')
  assert.match(sent[0].data.content, /服务繁忙/)
})

test('agent 返回未知 cardAction 时降级', async () => {
  const { deps, sent } = fakeDeps({
    agent: { run: async () => ({ cardAction: { type: 'other_action' } }) },
  })
  const h = createHandlers(deps)
  await h.handleMessage({
    event: {
      sender: { sender_id: { open_id: 'ou_bad2' } },
      message: { chat_id: 'oc_bad2', content: JSON.stringify({ text: '建料' }) },
    },
  })
  assert.strictEqual(sent.length, 1)
  assert.strictEqual(sent[0].data.msg_type, 'text')
  assert.match(sent[0].data.content, /服务繁忙/)
})

test('同 openId 消息串行执行', async () => {
  const starts = []
  const ends = []
  const { deps } = fakeDeps({
    agent: {
      run: async (_openId, text) => {
        starts.push(text)
        await sleep(15)
        ends.push(text)
        return { reply: text }
      },
    },
  })
  const h = createHandlers(deps)
  await Promise.all([
    h.handleMessage({ event: { sender: { sender_id: { open_id: 'ou_1' } }, message: { chat_id: 'oc_1', content: JSON.stringify({ text: 'm1' }) } } }),
    h.handleMessage({ event: { sender: { sender_id: { open_id: 'ou_1' } }, message: { chat_id: 'oc_1', content: JSON.stringify({ text: 'm2' }) } } }),
  ])
  assert.deepStrictEqual(starts, ['m1', 'm2'])
  assert.deepStrictEqual(ends, ['m1', 'm2'])
})

test('回调重复提交仅处理一次', async () => {
  let called = 0
  const { deps } = fakeDeps({
    createPart: async () => { called++; return { success: true, data: {} } },
  })
  const h = createHandlers(deps)
  const payload = {
    operator: { open_id: 'ou_dup' },
    action: { action_type: 'form_submit', form_value: { material_name: '板', project_number: 'P1' } },
  }
  await h.handleCardCallback(payload)
  await h.handleCardCallback(payload)
  assert.strictEqual(called, 1)
})

test('回调去重 TTL 过期后允许再次处理', async () => {
  let called = 0
  const { deps } = fakeDeps({
    createPart: async () => { called++; return { success: true, data: {} } },
    callbackDedupeTtlMs: 1,
  })
  const h = createHandlers(deps)
  const payload = {
    operator: { open_id: 'ou_ttl' },
    action: { action_type: 'form_submit', form_value: { material_name: '板', project_number: 'P1' } },
  }
  await h.handleCardCallback(payload)
  await sleep(3)
  await h.handleCardCallback(payload)
  assert.strictEqual(called, 2)
})

test('每用户限流：超过阈值拒绝', async () => {
  let called = 0
  const { deps, sent } = fakeDeps({
    maxRequestsPerMinute: 1,
    agent: { run: async () => { called++; return { reply: 'ok' } } },
  })
  const h = createHandlers(deps)
  const p = { event: { sender: { sender_id: { open_id: 'ou_rl' } }, message: { chat_id: 'oc_rl', content: JSON.stringify({ text: '建料' }) } } }
  await h.handleMessage(p)
  await h.handleMessage(p)
  assert.strictEqual(called, 1)
  assert.strictEqual(sent.length, 2)
  assert.match(sent[1].data.content, /请求过于频繁/)
})

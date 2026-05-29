# 飞书 PLM 物料 Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把飞书静态表单机器人升级为有边界、有记忆、能多轮对话的 PLM 物料 Agent，对话收集字段后弹预填卡片二次确认再创建。

**Architecture:** OpenAI 协议兼容端点驱动的 agent 循环（tool calling）。`config/form-schema.json` 为字段单一数据源，agent/卡片/选项三处复用。创建是危险操作，agent 无直接建料 tool，只能调 `prepare_create_part` 弹确认卡片，真正创建走现有卡片回调。按 open_id 本地 JSON 持久化会话记忆。

**Tech Stack:** Node 18+、`openai` SDK、`@larksuiteoapi/node-sdk`（现有）、`axios`（现有）、内置 `node:test` + `node:assert` 做测试。

---

## File Structure

新增：
- `config/form-schema.json` — 物料字段定义（字段单一数据源）
- `config/agent.json` — systemPrompt / allowedTools / maxSteps / maxHistory
- `src/memory.js` — 按 open_id 读/写/截断会话历史（纯 fs，无外部依赖）
- `src/form-config.js` — 读 schema + 解析字段选项（PLM 字段调 plm-client，归一化）
- `src/tools.js` — tool schema 定义 + executeTool 处理器
- `src/agent.js` — agent 循环工厂（依赖注入 openai / plmClient / config / schema / memory）
- `test/*.test.js` — 各模块单测

改动：
- `src/card-template.js` — `buildCreatePartCard` 改 async + prefill + 走 form-config
- `src/index.js` — 收消息走 agent.run；启动校验 OPENAI_* 环境变量
- `package.json` — 加 `openai` 依赖 + `test` 脚本
- `.env.example` / `.env` — 加 OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL

---

## Task 0: 项目初始化

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: 初始化 git 仓库**

Run:
```bash
cd /Users/jaiken/workplace/ai/FeishuCardBot && git init && git add -A && git commit -m "chore: snapshot before agent refactor"
```
Expected: 初始 commit 成功。

- [ ] **Step 2: 安装 openai 依赖**

Run:
```bash
cd /Users/jaiken/workplace/ai/FeishuCardBot && npm install openai
```
Expected: `openai` 写入 package.json dependencies。

- [ ] **Step 3: 加 test 脚本**

修改 `package.json` 的 `scripts`，加入：
```json
    "test": "node --test"
```
完整 scripts 块：
```json
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "node --test"
  },
```

- [ ] **Step 4: 补环境变量到 .env.example**

在 `.env.example` 末尾追加：
```
# OpenAI 协议兼容端点（Agent 运行时）
OPENAI_BASE_URL=https://your-endpoint/v1
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=your-model-id
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add openai dep, test script, env vars"
```

---

## Task 1: src/memory.js（会话记忆）

**Files:**
- Create: `src/memory.js`
- Test: `test/memory.test.js`

- [ ] **Step 1: 写失败测试**

`test/memory.test.js`:
```js
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadHistory, appendHistory, clearHistory } = require('../src/memory')

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mem-'))
}

test('loadHistory 不存在返回空数组', () => {
  assert.deepStrictEqual(loadHistory('u1', tmpDir()), [])
})

test('appendHistory 持久化并可读回', () => {
  const dir = tmpDir()
  appendHistory('u1', [{ role: 'user', content: 'hi' }], 20, dir)
  assert.deepStrictEqual(loadHistory('u1', dir), [{ role: 'user', content: 'hi' }])
})

test('appendHistory 超 maxHistory 截断为最近 N 条', () => {
  const dir = tmpDir()
  const msgs = Array.from({ length: 5 }, (_, i) => ({ role: 'user', content: String(i) }))
  appendHistory('u1', msgs, 3, dir)
  const h = loadHistory('u1', dir)
  assert.strictEqual(h.length, 3)
  assert.strictEqual(h[0].content, '2')
})

test('clearHistory 删除记忆', () => {
  const dir = tmpDir()
  appendHistory('u1', [{ role: 'user', content: 'hi' }], 20, dir)
  clearHistory('u1', dir)
  assert.deepStrictEqual(loadHistory('u1', dir), [])
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: FAIL — Cannot find module '../src/memory'

- [ ] **Step 3: 实现 src/memory.js**

```js
/**
 * 会话记忆：按 open_id 存储多轮对话历史，本地 JSON 持久化。
 */
const fs = require('fs')
const path = require('path')

const DEFAULT_DIR = path.join(__dirname, '..', 'data', 'memory')

function filePath(openId, baseDir) {
  return path.join(baseDir, `${openId}.json`)
}

function loadHistory(openId, baseDir = DEFAULT_DIR) {
  try {
    return JSON.parse(fs.readFileSync(filePath(openId, baseDir), 'utf8'))
  } catch {
    return []
  }
}

function appendHistory(openId, messages, maxHistory = 20, baseDir = DEFAULT_DIR) {
  const next = [...loadHistory(openId, baseDir), ...messages].slice(-maxHistory)
  fs.mkdirSync(baseDir, { recursive: true })
  fs.writeFileSync(filePath(openId, baseDir), JSON.stringify(next, null, 2))
  return next
}

function clearHistory(openId, baseDir = DEFAULT_DIR) {
  try {
    fs.unlinkSync(filePath(openId, baseDir))
  } catch {
    /* 不存在则忽略 */
  }
}

module.exports = { loadHistory, appendHistory, clearHistory }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: PASS（4 个 memory 用例）

- [ ] **Step 5: Commit**

```bash
git add src/memory.js test/memory.test.js
git commit -m "feat: add per-user conversation memory"
```

---

## Task 2: src/form-config.js（schema 加载 + 选项解析）

**Files:**
- Create: `src/form-config.js`
- Test: `test/form-config.test.js`

依赖现有 `src/plm-client.js`，其导出：`getProjectOptions / getLibraryOptions / getViewOptions / getFolderOptions / getCategoryOptions`，各返回选项数组（可能为空）。

- [ ] **Step 1: 写失败测试**

`test/form-config.test.js`:
```js
const { test } = require('node:test')
const assert = require('node:assert')
const { resolveFields, resolveFieldOptions, normalizeOption } = require('../src/form-config')

test('normalizeOption 兼容 label/name/id 字段名', () => {
  assert.deepStrictEqual(normalizeOption({ label: '设计视图', value: 'design' }), { text: '设计视图', value: 'design' })
  assert.deepStrictEqual(normalizeOption({ name: 'A', id: 'a' }), { text: 'A', value: 'a' })
})

test('static 字段直接取 options', async () => {
  const field = { type: 'select', optionSource: { type: 'static', options: [{ text: 'X', value: 'x' }] } }
  const r = await resolveFieldOptions(field, {})
  assert.deepStrictEqual(r, { options: [{ text: 'X', value: 'x' }], unavailable: false })
})

test('plm 字段调对应 client 函数并归一化', async () => {
  const fakeClient = { getProjectOptions: async () => [{ text: 'PRJ-1', value: 'p1' }] }
  const field = { type: 'select', optionSource: { type: 'plm', endpoint: 'projects' } }
  const r = await resolveFieldOptions(field, fakeClient)
  assert.deepStrictEqual(r.options, [{ text: 'PRJ-1', value: 'p1' }])
  assert.strictEqual(r.unavailable, false)
})

test('plm 拉取为空标记 unavailable', async () => {
  const fakeClient = { getProjectOptions: async () => [] }
  const field = { type: 'select', optionSource: { type: 'plm', endpoint: 'projects' } }
  const r = await resolveFieldOptions(field, fakeClient)
  assert.deepStrictEqual(r.options, [])
  assert.strictEqual(r.unavailable, true)
})

test('plm 拉取抛错标记 unavailable', async () => {
  const fakeClient = { getProjectOptions: async () => { throw new Error('down') } }
  const field = { type: 'select', optionSource: { type: 'plm', endpoint: 'projects' } }
  const r = await resolveFieldOptions(field, fakeClient)
  assert.strictEqual(r.unavailable, true)
})

test('resolveFields 处理整 schema，input 字段不带 options', async () => {
  const schema = { fields: [
    { name: 'material_name', type: 'input' },
    { name: 'view', type: 'select', optionSource: { type: 'static', options: [{ text: 'X', value: 'x' }] } },
  ] }
  const resolved = await resolveFields(schema, {})
  assert.strictEqual(resolved[0].options, undefined)
  assert.deepStrictEqual(resolved[1].options, [{ text: 'X', value: 'x' }])
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: FAIL — Cannot find module '../src/form-config'

- [ ] **Step 3: 实现 src/form-config.js**

```js
/**
 * 表单 schema 加载 + 字段选项解析。
 * 选项来源：static（配置内写死）或 plm（调 plm-client 动态拉取）。
 */
const fs = require('fs')
const path = require('path')
const plmClient = require('./plm-client')

const DEFAULT_SCHEMA_PATH = path.join(__dirname, '..', 'config', 'form-schema.json')

const ENDPOINT_MAP = {
  projects: 'getProjectOptions',
  libraries: 'getLibraryOptions',
  views: 'getViewOptions',
  folders: 'getFolderOptions',
  categories: 'getCategoryOptions',
}

function loadSchema(schemaPath = DEFAULT_SCHEMA_PATH) {
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
}

function normalizeOption(opt) {
  return {
    text: opt.text ?? opt.label ?? opt.name ?? String(opt.value ?? opt.id ?? ''),
    value: opt.value ?? opt.id ?? opt.name ?? '',
  }
}

async function resolveFieldOptions(field, client = plmClient) {
  const src = field.optionSource
  if (!src) return { options: [], unavailable: false }
  if (src.type === 'static') {
    return { options: (src.options || []).map(normalizeOption), unavailable: false }
  }
  if (src.type === 'plm') {
    const fnName = ENDPOINT_MAP[src.endpoint]
    try {
      const raw = await client[fnName]()
      const options = (raw || []).map(normalizeOption)
      return { options, unavailable: options.length === 0 }
    } catch {
      return { options: [], unavailable: true }
    }
  }
  return { options: [], unavailable: false }
}

async function resolveFields(schema, client = plmClient) {
  return Promise.all(
    schema.fields.map(async (f) => {
      if (f.type === 'select') {
        const { options, unavailable } = await resolveFieldOptions(f, client)
        return { ...f, options, unavailable }
      }
      return { ...f }
    })
  )
}

module.exports = { loadSchema, resolveFields, resolveFieldOptions, normalizeOption, ENDPOINT_MAP, DEFAULT_SCHEMA_PATH }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: PASS（form-config 全部用例）

- [ ] **Step 5: Commit**

```bash
git add src/form-config.js test/form-config.test.js
git commit -m "feat: add form-config schema loader and option resolver"
```

---

## Task 3: src/tools.js（tool 定义 + 执行）

**Files:**
- Create: `src/tools.js`
- Test: `test/tools.test.js`

- [ ] **Step 1: 写失败测试**

`test/tools.test.js`:
```js
const { test } = require('node:test')
const assert = require('node:assert')
const { getToolDefinitions, executeTool } = require('../src/tools')

const schema = { fields: [
  { name: 'material_name', type: 'input', required: true },
  { name: 'project_number', type: 'select', required: true, optionSource: { type: 'static', options: [{ text: 'P1', value: 'p1' }] } },
  { name: 'note', type: 'input', required: false },
] }

test('getToolDefinitions 仅返回白名单内 tool', () => {
  const defs = getToolDefinitions(['list_field_options'])
  assert.strictEqual(defs.length, 1)
  assert.strictEqual(defs[0].function.name, 'list_field_options')
})

test('list_field_options 返回字段选项', async () => {
  const out = await executeTool('list_field_options', { field: 'project_number' }, { schema, client: {} })
  assert.deepStrictEqual(out.result.options, [{ text: 'P1', value: 'p1' }])
})

test('list_field_options 未知字段返回 error', async () => {
  const out = await executeTool('list_field_options', { field: 'nope' }, { schema, client: {} })
  assert.ok(out.result.error)
})

test('prepare_create_part 缺必填返回 error', async () => {
  const out = await executeTool('prepare_create_part', { values: { material_name: '板' } }, { schema, client: {} })
  assert.ok(out.result.error.includes('project_number'))
})

test('prepare_create_part 字段齐返回 confirm_create 卡片动作', async () => {
  const values = { material_name: '板', project_number: 'p1' }
  const out = await executeTool('prepare_create_part', { values }, { schema, client: {} })
  assert.deepStrictEqual(out.cardAction, { type: 'confirm_create', values })
})

test('白名单外 tool name 抛错', async () => {
  await assert.rejects(() => executeTool('rm_rf', {}, { schema, client: {} }))
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: FAIL — Cannot find module '../src/tools'

- [ ] **Step 3: 实现 src/tools.js**

```js
/**
 * Agent 工具：定义 OpenAI tool schema + 执行处理器。
 * 白名单外的 tool 一律拒绝。创建物料不在此直接发生——
 * prepare_create_part 只返回卡片动作，真正创建走卡片回调。
 */
const formConfig = require('./form-config')

const ALL_TOOLS = {
  list_field_options: {
    type: 'function',
    function: {
      name: 'list_field_options',
      description: '查询某个物料字段的可选项（如项目号、所在库、物料分类）。',
      parameters: {
        type: 'object',
        properties: {
          field: { type: 'string', description: '字段 name，例如 project_number / library / category' },
        },
        required: ['field'],
      },
    },
  },
  prepare_create_part: {
    type: 'function',
    function: {
      name: 'prepare_create_part',
      description: '所有必填字段收集齐后调用，弹出预填表单卡片让用户确认。不会直接创建物料。',
      parameters: {
        type: 'object',
        properties: {
          values: { type: 'object', description: '已收集的字段键值对，键为字段 name' },
        },
        required: ['values'],
      },
    },
  },
}

function getToolDefinitions(allowedTools) {
  return allowedTools.map((n) => ALL_TOOLS[n]).filter(Boolean)
}

async function executeTool(name, args, deps) {
  const { schema, client } = deps
  if (name === 'list_field_options') {
    const field = schema.fields.find((f) => f.name === args.field)
    if (!field) return { result: { error: `未知字段: ${args.field}` } }
    const { options, unavailable } = await formConfig.resolveFieldOptions(field, client)
    return { result: { field: args.field, options, unavailable } }
  }
  if (name === 'prepare_create_part') {
    const required = schema.fields.filter((f) => f.required).map((f) => f.name)
    const values = args.values || {}
    const missing = required.filter((n) => !values[n])
    if (missing.length) return { result: { error: `缺少必填字段: ${missing.join(', ')}` } }
    return { cardAction: { type: 'confirm_create', values } }
  }
  throw new Error(`tool not allowed: ${name}`)
}

module.exports = { getToolDefinitions, executeTool, ALL_TOOLS }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: PASS（tools 全部用例）

- [ ] **Step 5: Commit**

```bash
git add src/tools.js test/tools.test.js
git commit -m "feat: add agent tools with whitelist and create-confirm gating"
```

---

## Task 4: src/agent.js（agent 循环）

**Files:**
- Create: `src/agent.js`
- Test: `test/agent.test.js`

工厂 `createAgent` 用依赖注入，便于 mock OpenAI。OpenAI chat completions 返回结构：
`resp.choices[0].message` 含 `content` 或 `tool_calls`（每个 `{ id, function: { name, arguments } }`，arguments 为 JSON 字符串）。

- [ ] **Step 1: 写失败测试**

`test/agent.test.js`:
```js
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: FAIL — Cannot find module '../src/agent'

- [ ] **Step 3: 实现 src/agent.js**

```js
/**
 * Agent 循环：OpenAI 协议 tool calling。
 * 边界：白名单 tool（tools.js）、maxSteps 限调用次数、创建走卡片确认。
 */
const memory = require('./memory')
const tools = require('./tools')

function buildSystemPrompt(config, schema) {
  const lines = schema.fields
    .map((f) => `- ${f.name}（${f.label || f.name}，${f.required ? '必填' : '可选'}）`)
    .join('\n')
  return `${config.systemPrompt}\n\n创建物料需收集以下字段:\n${lines}\n\n字段齐全后调用 prepare_create_part 弹出确认卡片，绝不声称已直接创建。`
}

function createAgent({ openai, plmClient, config, schema, memoryDir, memoryMod = memory, toolsMod = tools }) {
  async function run(openId, userText) {
    const history = memoryMod.loadHistory(openId, memoryDir)
    const messages = [
      { role: 'system', content: buildSystemPrompt(config, schema) },
      ...history,
      { role: 'user', content: userText },
    ]
    const toolDefs = toolsMod.getToolDefinitions(config.allowedTools)

    let finalReply = null
    let cardAction = null

    for (let step = 0; step < config.maxSteps; step++) {
      let resp
      try {
        resp = await openai.chat.completions.create({ model: config.model, messages, tools: toolDefs })
      } catch {
        return { reply: '服务暂不可用，请稍后再试' }
      }
      const msg = resp.choices[0].message
      messages.push(msg)

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        finalReply = msg.content || ''
        break
      }

      let stop = false
      for (const tc of msg.tool_calls) {
        let args = {}
        try { args = JSON.parse(tc.function.arguments || '{}') } catch { /* 容错空参 */ }
        let out
        try {
          out = await toolsMod.executeTool(tc.function.name, args, { schema, client: plmClient })
        } catch (e) {
          out = { result: { error: e.message } }
        }
        if (out.cardAction) {
          cardAction = out.cardAction
          stop = true
          messages.push({ role: 'tool', tool_call_id: tc.id, content: '已弹出确认卡片' })
        } else {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out.result) })
        }
      }
      if (stop) break
    }

    if (!finalReply && !cardAction) {
      finalReply = '处理超时，请简化你的请求后重试'
    }

    const toPersist = [{ role: 'user', content: userText }]
    if (finalReply) toPersist.push({ role: 'assistant', content: finalReply })
    memoryMod.appendHistory(openId, toPersist, config.maxHistory, memoryDir)

    return cardAction ? { cardAction } : { reply: finalReply }
  }

  return { run }
}

module.exports = { createAgent, buildSystemPrompt }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: PASS（agent 全部用例）

- [ ] **Step 5: Commit**

```bash
git add src/agent.js test/agent.test.js
git commit -m "feat: add agent loop with tool calling, boundaries, memory"
```

---

## Task 5: 重构 src/card-template.js（async + prefill）

**Files:**
- Modify: `src/card-template.js`
- Test: `test/card-template.test.js`

把写死的选项数组与 `buildSelectOptions/buildLabeledSelect` 逻辑迁移到 form-config 驱动。`buildCreatePartCard(prefill)` 改 async：调 `loadSchema()` + `resolveFields()` 渲染。prefill 非空时顶部加一段只读摘要（确认 agent 收集的值），input 字段用 `default_value` 预填（Feishu input 支持），select 字段不强行预选（Feishu select_static 无可靠默认选中），靠摘要确认。

- [ ] **Step 1: 写失败测试**

`test/card-template.test.js`:
```js
const { test } = require('node:test')
const assert = require('node:assert')

// mock form-config，避免读真实文件/调 PLM
const formConfig = require('../src/form-config')
const schema = { header: { title: 'T', template: 'blue' }, submit: { text: '✅ 确定创建', action: 'submit_create_part' }, fields: [
  { name: 'material_name', type: 'input', label: '物料名称', placeholder: '输入', required: true, maxLength: 100 },
  { name: 'project_number', type: 'select', label: '项目号', placeholder: '选择', required: true },
] }
formConfig.loadSchema = () => schema
formConfig.resolveFields = async () => [
  { name: 'material_name', type: 'input', label: '物料名称', placeholder: '输入', required: true, maxLength: 100 },
  { name: 'project_number', type: 'select', label: '项目号', placeholder: '选择', required: true, options: [{ text: 'P1', value: 'p1' }], unavailable: false },
]

const { buildCreatePartCard } = require('../src/card-template')

function findForm(card) {
  return card.body.elements.find((e) => e.tag === 'form')
}

test('生成卡片含 form + 提交按钮（form_action_type submit）', async () => {
  const card = await buildCreatePartCard()
  assert.strictEqual(card.schema, '2.0')
  const form = findForm(card)
  const btn = form.elements.find((e) => e.tag === 'button')
  assert.strictEqual(btn.form_action_type, 'submit')
  assert.strictEqual(btn.behaviors[0].value.action, 'submit_create_part')
})

test('input 字段 prefill 用 default_value', async () => {
  const card = await buildCreatePartCard({ material_name: '主控板' })
  const form = findForm(card)
  const input = form.elements.find((e) => e.tag === 'input' && e.name === 'material_name')
  assert.strictEqual(input.default_value, '主控板')
})

test('prefill 非空时含只读摘要块', async () => {
  const card = await buildCreatePartCard({ material_name: '主控板', project_number: 'p1' })
  const json = JSON.stringify(card)
  assert.ok(json.includes('主控板'))
  assert.ok(json.includes('待确认') || json.includes('确认'))
})

test('select 字段 unavailable 时 placeholder 提示不可用', async () => {
  formConfig.resolveFields = async () => [
    { name: 'project_number', type: 'select', label: '项目号', placeholder: '选择', required: true, options: [], unavailable: true },
  ]
  const card = await buildCreatePartCard()
  const json = JSON.stringify(card)
  assert.ok(json.includes('暂无可用选项'))
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: FAIL（buildCreatePartCard 当前是同步且不接受 prefill / 不读 form-config）

- [ ] **Step 3: 重写 src/card-template.js**

完整替换文件内容：
```js
/**
 * 新建部件 - 消息卡片模板（飞书卡片 2.0 格式）
 *
 * 字段定义来自 config/form-schema.json（经 form-config 解析，选项实时拉 PLM）。
 * buildCreatePartCard(prefill) 用于 agent 收集字段后的确认卡片。
 *
 * 注意：
 * - form / input / select_static 需飞书卡片 2.0（schema: "2.0"）
 * - input 支持 label 与 default_value；select_static 不支持 label，用 markdown 标签
 * - 表单提交按钮需 form_action_type: "submit" + behaviors 回调
 */
const formConfig = require('./form-config')

function buildSelectOptions(options) {
  return options.map((opt) => ({
    text: { tag: 'plain_text', content: opt.text },
    value: opt.value,
  }))
}

// 渲染单个字段为卡片元素数组
function renderField(field, prefill) {
  if (field.type === 'input') {
    const el = {
      tag: 'input',
      name: field.name,
      required: !!field.required,
      label: { tag: 'plain_text', content: field.label },
      placeholder: { tag: 'plain_text', content: field.placeholder || '' },
    }
    if (field.maxLength) el.max_length = field.maxLength
    if (prefill[field.name] != null) el.default_value = String(prefill[field.name])
    return [el]
  }
  if (field.type === 'select') {
    const placeholder = field.unavailable ? '暂无可用选项（PLM 不可用）' : field.placeholder || ''
    return [
      { tag: 'markdown', content: field.required ? `**${field.label}** *` : `**${field.label}**` },
      {
        tag: 'select_static',
        name: field.name,
        placeholder: { tag: 'plain_text', content: placeholder },
        options: buildSelectOptions(field.options || []),
      },
    ]
  }
  return []
}

// prefill 非空 → 顶部只读摘要，确认 agent 收集的值
function buildSummary(fields, prefill) {
  const keys = Object.keys(prefill)
  if (keys.length === 0) return []
  const lines = fields
    .filter((f) => prefill[f.name] != null)
    .map((f) => `- **${f.label}**：${prefill[f.name]}`)
    .join('\n')
  return [{ tag: 'markdown', content: `**待确认信息**\n${lines}` }]
}

async function buildCreatePartCard(prefill = {}) {
  const schema = formConfig.loadSchema()
  const fields = await formConfig.resolveFields(schema)

  const formElements = [
    ...buildSummary(fields, prefill),
    ...fields.flatMap((f) => renderField(f, prefill)),
    {
      tag: 'button',
      text: { tag: 'plain_text', content: schema.submit?.text || '✅ 确定创建' },
      type: 'primary',
      width: 'fill',
      name: 'submit_btn',
      form_action_type: 'submit',
      behaviors: [
        { type: 'callback', value: { action: schema.submit?.action || 'submit_create_part' } },
      ],
    },
  ]

  return {
    schema: '2.0',
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      title: { tag: 'plain_text', content: schema.header?.title || '🔧 新建部件' },
      template: schema.header?.template || 'blue',
    },
    body: {
      elements: [{ tag: 'form', name: 'create_part_form', elements: formElements }],
    },
  }
}

// 结果卡片：创建成功/失败反馈
function buildResultCard(result) {
  if (result.success) {
    const d = result.data || {}
    return {
      schema: '2.0',
      header: { title: { tag: 'plain_text', content: '✅ 部件创建成功' }, template: 'green' },
      body: {
        elements: [
          { tag: 'markdown', content:
            `**物料名称**：${d.materialName || '-'}\n` +
            `**部件编号**：${d.partNumber || '-'}\n` +
            `**项目号**：${d.projectNumber || '-'}\n` +
            `**所在库**：${d.library || '-'}\n` +
            `**视图**：${d.view || '-'}\n` +
            `**文件夹**：${d.folder || '-'}\n` +
            `**分类**：${d.category || '-'}` },
        ],
      },
    }
  }
  return {
    schema: '2.0',
    header: { title: { tag: 'plain_text', content: '❌ 部件创建失败' }, template: 'red' },
    body: { elements: [{ tag: 'markdown', content: `失败原因：${result.message || '未知错误'}` }] },
  }
}

module.exports = { buildCreatePartCard, buildResultCard }
```

> 注：若现有 `buildResultCard` 与上方字段不一致，以现有实现为准——执行时先读现有 `src/card-template.js` 的 `buildResultCard`，保持其结构不变，仅迁移 `buildCreatePartCard`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: PASS（card-template 全部用例）

- [ ] **Step 5: Commit**

```bash
git add src/card-template.js test/card-template.test.js
git commit -m "feat: schema-driven async create-part card with prefill"
```

---

## Task 6: 配置文件 config/form-schema.json + config/agent.json

**Files:**
- Create: `config/form-schema.json`
- Create: `config/agent.json`
- Test: `test/config.test.js`

- [ ] **Step 1: 写失败测试**

`test/config.test.js`:
```js
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
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: FAIL — 文件不存在

- [ ] **Step 3: 创建 config/form-schema.json**

```json
{
  "header": { "title": "🔧 新建部件", "template": "blue" },
  "submit": { "text": "✅ 确定创建", "action": "submit_create_part" },
  "fields": [
    {
      "name": "material_name",
      "type": "input",
      "label": "物料名称",
      "placeholder": "请输入物料名称",
      "required": true,
      "maxLength": 100
    },
    {
      "name": "project_number",
      "type": "select",
      "label": "物料项目号",
      "placeholder": "请选择物料项目号",
      "required": true,
      "optionSource": { "type": "plm", "endpoint": "projects" }
    },
    {
      "name": "library",
      "type": "select",
      "label": "所在库",
      "placeholder": "请选择所在库",
      "required": true,
      "optionSource": { "type": "plm", "endpoint": "libraries" }
    },
    {
      "name": "view",
      "type": "select",
      "label": "视图",
      "placeholder": "请选择视图",
      "required": true,
      "optionSource": {
        "type": "static",
        "options": [
          { "text": "设计视图", "value": "design" },
          { "text": "制造视图", "value": "manufacturing" },
          { "text": "工艺视图", "value": "process" }
        ]
      }
    },
    {
      "name": "folder",
      "type": "select",
      "label": "所在文件夹",
      "placeholder": "请选择所在文件夹",
      "required": true,
      "optionSource": { "type": "plm", "endpoint": "folders" }
    },
    {
      "name": "category",
      "type": "select",
      "label": "物料分类",
      "placeholder": "请选择物料分类",
      "required": true,
      "optionSource": { "type": "plm", "endpoint": "categories" }
    }
  ]
}
```

- [ ] **Step 4: 创建 config/agent.json**

```json
{
  "model": "",
  "systemPrompt": "你是 PLM 物料助手。只处理物料创建与查询相关请求；无关话题礼貌拒绝。需要某字段可选项时调用 list_field_options 查询。",
  "topicBoundary": "仅 PLM / 物料领域",
  "allowedTools": ["list_field_options", "prepare_create_part"],
  "maxSteps": 6,
  "maxHistory": 20
}
```

> `model` 为空时由 index.js 回退到 `process.env.OPENAI_MODEL`。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test`
Expected: PASS（config 用例）

- [ ] **Step 6: Commit**

```bash
git add config/form-schema.json config/agent.json test/config.test.js
git commit -m "feat: add form-schema and agent config files"
```

---

## Task 7: 接线 src/index.js

**Files:**
- Modify: `src/index.js`
- Test: 手动冒烟（需真实 OPENAI_* + 飞书凭证，无单测）

执行时先读现有 `src/index.js` 全文，按下述改动接线。

- [ ] **Step 1: 启动时校验 OPENAI_* 并初始化 agent**

在 `src/index.js` 顶部 require 区加：
```js
const OpenAI = require('openai')
const { createAgent } = require('./agent')
const formConfig = require('./form-config')
const plmClient = require('./plm-client')
const agentConfig = require('../config/agent.json')
```

在已有 APP_ID/APP_SECRET 校验之后加：
```js
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_MODEL = process.env.OPENAI_MODEL

if (!OPENAI_BASE_URL || !OPENAI_API_KEY || !OPENAI_MODEL) {
  console.error('❌ 请在 .env 配置 OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL')
  process.exit(1)
}

const openai = new OpenAI({ baseURL: OPENAI_BASE_URL, apiKey: OPENAI_API_KEY })
const formSchema = formConfig.loadSchema()
const agent = createAgent({
  openai,
  plmClient,
  config: { ...agentConfig, model: agentConfig.model || OPENAI_MODEL },
  schema: formSchema,
})
```

- [ ] **Step 2: 改 handleMessage 走 agent**

找到现有 `handleMessage`（原本直接发卡片）。改为提取用户文本 + openId，调 agent，按结果发文本或卡片：
```js
async function handleMessage(data) {
  try {
    const msg = data.message
    const openId = data.sender?.sender_id?.open_id || data.event?.sender?.sender_id?.open_id
    let text = ''
    try { text = JSON.parse(msg.content).text || '' } catch { /* 非文本消息 */ }
    if (!openId || !text) return

    const out = await agent.run(openId, text)

    if (out.cardAction?.type === 'confirm_create') {
      const card = await buildCreatePartCard(out.cardAction.values)
      await client.im.message.create({
        params: { receive_id_type: 'open_id' },
        data: { receive_id: openId, msg_type: 'interactive', content: JSON.stringify(card) },
      })
    } else {
      await client.im.message.create({
        params: { receive_id_type: 'open_id' },
        data: { receive_id: openId, msg_type: 'text', content: JSON.stringify({ text: out.reply }) },
      })
    }
  } catch (err) {
    console.error('❌ 处理消息失败:', err)
  }
}
```
> 执行时核对现有发消息调用的实际签名（`client.im.message.create` 参数），与现有 sendResultCard 保持一致的写法。`buildCreatePartCard` 现已是 async，调用处加 `await`。

- [ ] **Step 3: 卡片回调后写记忆（可选，保持现有创建逻辑不变）**

在现有 `handleCardCallback` 成功 `sendResultCard` 之后追加：
```js
    const { appendHistory } = require('./memory')
    appendHistory(openId, [{ role: 'assistant', content: `已创建物料：${formData.materialName}` }], agentConfig.maxHistory)
```

- [ ] **Step 4: 手动冒烟**

前置：`.env` 填好 FEISHU_* 与 OPENAI_*。
Run: `npm start`
操作：飞书给机器人发「帮我建个物料，叫主控板，项目 PRJ-2024-001，企业标准库，设计视图，IC芯片」
Expected:
- agent 多轮收集后弹出预填确认卡片（顶部"待确认信息"摘要，物料名称已预填）
- 点「确定创建」→ 收到结果卡片
- 发无关问题（如"今天天气"）→ agent 礼貌拒绝

- [ ] **Step 5: Commit**

```bash
git add src/index.js
git commit -m "feat: wire agent into feishu message handler"
```

---

## 验收

- [ ] `npm test` 全绿（memory / form-config / tools / agent / card-template / config）
- [ ] 手动冒烟：对话收集字段 → 确认卡片 → 创建成功
- [ ] 主题边界：无关问题被拒
- [ ] PLM 不可用：下拉显示"暂无可用选项"，不崩

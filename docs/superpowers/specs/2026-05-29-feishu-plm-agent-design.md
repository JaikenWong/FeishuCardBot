# 飞书 PLM 物料 Agent —— 设计文档

日期：2026-05-29
状态：已批准设计，待写实现计划

## 1. 背景与目标

当前项目（FeishuCardBot）是一个飞书 WebSocket 机器人：用户发消息 → 推送「新建部件」静态表单卡片 → 用户填表提交 → 调 PLM 创建部件 → 返回结果卡片。

目标：把它升级为一个**有边界、有记忆、能多轮对话**的 AI Agent，主功能是「创建物料」。
Agent 通过自然语言对话收集物料字段，调用工具校验，最终弹出预填表单卡片让用户确认后创建。

## 2. 关键决策

| 维度 | 决策 |
|------|------|
| 运行时 | OpenAI 协议兼容端点（`openai` SDK + 用户提供的 baseURL / modelId / apiKey） |
| 边界 | 主题边界 + tool 白名单 + 危险操作二次确认 + 调用次数限制（全部） |
| 记忆 | 按用户（open_id）的多轮会话上下文，本地 JSON 持久化 |
| 表单卡片角色 | 作为「创建 tool」的二次确认 UI（agent 不直接建料） |
| 选项来源 | PLM 系统动态拉取（复用现有 plm-client），失败/空 → 字段置空并提示不可用 |
| 配置生效 | 热加载：每次发卡重新读 schema 并拉 PLM |

**核心安全设计**：创建物料属危险操作。Agent **没有**直接创建料的 tool。Agent 对话收集字段 → 调 `prepare_create_part` → bot 弹预填表单卡片 → 用户点「确定创建」→ 走现有卡片回调真正创建。卡片即二次确认。

## 3. 架构

### 3.1 单一数据源

`config/form-schema.json` 定义物料字段。三处复用：
1. Agent 据此知道要收集哪些字段（生成 system prompt 中的字段清单）
2. 确认卡片据此渲染（预填 agent 收集的值）
3. 各字段选项据 `optionSource` 拉取（PLM endpoint 或 static）

### 3.2 文件结构

新增：

| 文件 | 职责 | 依赖 |
|------|------|------|
| `config/form-schema.json` | 物料字段定义（name/type/label/placeholder/required/optionSource） | — |
| `config/agent.json` | systemPrompt、主题边界规则、allowedTools、maxSteps、maxHistory | — |
| `src/agent.js` | Agent 循环：OpenAI client + tool calling，执行白名单 tool，限调用次数，返回回复文本或卡片动作 | openai, tools, memory, config |
| `src/tools.js` | tool 定义 + 处理器 | plm-client, form-config |
| `src/memory.js` | 按 open_id 存/读/截断会话历史，本地 JSON 持久化 | fs |
| `src/form-config.js` | 读 form-schema.json，解析各字段选项来源（PLM 字段调 plm-client 并行拉取），归一化为 `{text,value}` | plm-client |

改动：

| 文件 | 改动 |
|------|------|
| `src/card-template.js` | `buildCreatePartCard` 改 async，接收预填值 + 通过 form-config 拉选项渲染；`buildResultCard` 不动 |
| `src/index.js` | 收消息 → `agent.run(openId, text)` → 发文本回复或渲染确认卡片；卡片回调 → `createPart`（不动）+ 写记忆 |
| `package.json` | 新增依赖 `openai` |
| `.env` / `.env.example` | 新增 `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL` |

## 4. 数据结构

### 4.1 form-schema.json

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

`optionSource.endpoint` 名 → plm-client 函数映射：
`projects→getProjectOptions`、`libraries→getLibraryOptions`、`views→getViewOptions`、`folders→getFolderOptions`、`categories→getCategoryOptions`。

PLM 返回元素归一化为 `{text, value}`，兼容 `label`/`name`/`id` 字段名。
拉取失败或空 → `options=[]`，该下拉 placeholder 改「暂无可用选项（PLM 不可用）」，卡片仍渲染。

### 4.2 agent.json

```json
{
  "model": "${OPENAI_MODEL}",
  "systemPrompt": "你是 PLM 物料助手。只处理物料创建与查询相关请求；无关话题礼貌拒绝。收集物料字段后，调用 prepare_create_part 弹出确认卡片，绝不声称已直接创建。",
  "topicBoundary": "仅 PLM / 物料领域",
  "allowedTools": ["list_field_options", "prepare_create_part"],
  "maxSteps": 6,
  "maxHistory": 20
}
```

> 说明：`${OPENAI_MODEL}` 若为空则回退到 `process.env.OPENAI_MODEL`。systemPrompt 实际下发时会附加 form-schema 的字段清单（必填项、可选值）。

### 4.3 记忆文件 `data/memory/<openId>.json`

```json
[
  { "role": "user", "content": "帮我建个物料" },
  { "role": "assistant", "content": "好的，物料名称是？" }
]
```

仅存 `role` 为 `user`/`assistant` 的对话消息（不持久化 tool 中间消息）。超 `maxHistory` 条则保留最近 N 条。

## 5. 组件接口

### 5.1 src/memory.js

- `loadHistory(openId): Message[]` — 读文件，不存在返回 `[]`
- `appendHistory(openId, messages: Message[]): void` — 追加并按 maxHistory 截断后写回
- `clearHistory(openId): void` — 删除该用户记忆（创建成功后可选清理上下文）

### 5.2 src/tools.js

- `getToolDefinitions(allowedTools): ToolSpec[]` — 返回 OpenAI tool schema，仅含白名单内的
- `executeTool(name, args): Promise<{ result?, cardAction? }>`
  - `list_field_options({ field })` → 调 form-config 拉该字段选项，返回 `{ result: options }`
  - `prepare_create_part({ values })` → 校验必填字段齐全，返回 `{ cardAction: { type: 'confirm_create', values } }`（不创建）
  - 白名单外的 name → 抛错

### 5.3 src/agent.js

- `run(openId, userText): Promise<{ reply?: string, cardAction?: object }>`
  1. 加载 agent.json 配置 + form-schema
  2. loadHistory(openId)
  3. 构造 messages：system（systemPrompt + 字段清单）+ history + 新 user 消息
  4. 循环（≤ maxSteps）：调 OpenAI chat completion（带白名单 tools）
     - 若返回 tool_calls：executeTool 每个；若有 `cardAction`，结束循环返回该卡片动作；否则把 tool 结果喂回继续
     - 若返回普通文本：结束，返回 reply
  5. appendHistory（user + 最终 assistant 文本）
  6. 超 maxSteps 仍未收敛 → 返回降级提示

### 5.4 src/form-config.js

- `resolveFields(): Promise<ResolvedField[]>` — 读 schema，static 字段直接取 options，plm 字段 `Promise.all` 并行拉取并归一化；失败字段 options=[] 标记 unavailable
- `getSchema(): Schema` — 读取并解析 form-schema.json（供 agent 取字段清单）

### 5.5 src/card-template.js

- `buildCreatePartCard(prefill = {}): Promise<CardJSON>` — 调 form-config.resolveFields()，按字段类型渲染（input / select_static + markdown 标签），select 用 prefill 值设默认选中，提交按钮用 `form_action_type: 'submit'` + behaviors
- `buildResultCard(result): CardJSON` — 不变

## 6. 控制流

### 6.1 收到消息

```
im.message.receive_v1
  → handleMessage 取 openId + text
  → agent.run(openId, text)
  → 若 cardAction.type === 'confirm_create':
       card = await buildCreatePartCard(cardAction.values)
       发送卡片给用户
    否则发送 reply 文本
```

### 6.2 卡片回调（确定创建）

```
card.action.trigger
  → handleCardCallback（现有逻辑，已用 value.action === 'submit_create_part' 判断）
  → createPart(formData)（不动）
  → sendResultCard
  → memory.appendHistory(openId, [{role:'assistant', content:'已创建物料 XXX'}])（记录结果，可选）
```

## 7. 边界落地

| 边界 | 实现 |
|------|------|
| 主题边界 | systemPrompt 约束只答 PLM/物料，无关问题礼貌拒 |
| tool 白名单 | tools.js 仅注册 `allowedTools` 内的 tool schema；executeTool 对白名单外 name 抛错 |
| 危险操作二次确认 | create 永远走卡片确认；agent 无直接建料 tool，只有 `prepare_create_part`（弹卡片） |
| 调用次数限制 | agent 循环 cap `maxSteps`，超出返回降级提示，防 tool 死循环；记忆截断 `maxHistory` |

## 8. 容错

- OpenAI 调用失败 → 回复「服务暂不可用，请稍后再试」
- tool 执行失败 → 错误信息喂回 agent 继续，或多次失败后降级提示
- PLM 选项拉取失败/空 → 该字段空选项 + 不可用提示，卡片仍渲染
- form-schema / agent.json 缺失或解析失败 → 启动即报错退出（fail fast，清晰日志）
- 缺 `OPENAI_*` 环境变量 → 启动即报错退出

## 9. 测试

- **agent.js**：mock OpenAI；用例：纯文本回复、tool_call→handler→终答、prepare_create_part 返回 cardAction、maxSteps 生效返回降级
- **memory.js**：load 不存在返回 []、append 持久化、超 maxHistory 截断、clear
- **tools.js**：getToolDefinitions 仅返回白名单、list_field_options 调通 form-config、prepare_create_part 必填校验、白名单外 name 抛错
- **form-config.js**：static 字段解析、plm endpoint 映射（mock plm-client）、空/失败 → 空选项标记 unavailable、schema 解析错误
- **card-template.js**：prefill 值生成 select 默认选中、字段类型渲染正确、提交按钮 schema 正确

## 10. 非目标（YAGNI）

- 不做跨会话用户偏好记忆（仅会话上下文）
- 不做整卡片结构（header 颜色等）的运行时编辑界面
- 字段类型仅支持 `input` / `select`，后续按需扩展
- 不做 TTL 缓存（每次发卡实时拉 PLM，符合热加载要求）
- 不做多模型路由 / 流式输出

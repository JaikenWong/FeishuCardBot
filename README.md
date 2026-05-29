# Feishu PLM Agent

飞书 WebSocket 机器人 + OpenAI tool-calling agent。
目标：多轮收集物料字段，弹确认卡片，用户确认后调用 PLM 创建。

## 能力

- 多轮对话收集字段（有记忆，按 `open_id` 持久化）
- 工具白名单：`list_field_options`、`prepare_create_part`
- 危险操作隔离：agent 不直接创建，只能弹确认卡片
- 卡片 schema 驱动：`config/form-schema.json`
- PLM 选项降级：接口异常时返回空选项，不崩

## 目录

- `src/index.js`: 飞书事件接线、agent 调度、卡片回调创建
- `src/agent.js`: agent 循环与 step 限制
- `src/tools.js`: tool 定义与执行
- `src/form-config.js`: schema 加载与选项解析
- `src/card-template.js`: 确认卡片/结果卡片
- `src/plm-client.js`: PLM HTTP client（支持工厂注入）
- `src/memory.js`: 本地会话记忆
- `src/message-utils.js`: 飞书事件解析工具
- `src/audit-log.js`: JSONL 审计日志
- `src/audit-query.js`: 审计日志解析与 requestId 聚合
- `src/audit-report.js`: 审计状态汇总
- `src/handlers.js`: 消息/回调处理编排
- `src/doctor.js`: 启动前体检规则
- `src/harness-check.js`: Harness 静态门禁
- `src/replay.js`: 对话回放执行器

## 环境变量

复制 `.env.example` 到 `.env`。

必填：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `OPENAI_BASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

可选：

- `PLM_API_BASE_URL`（默认 `https://plm.example.com/api`）
- `PLM_API_TOKEN`
- `LOG_LEVEL`
- `AUDIT_LOG_PATH`（默认 `data/audit/audit.jsonl`）

## 启动

```bash
npm install
npm test
npm start
```

## 对话流程

1. 用户发起创建需求
2. agent 多轮问答补齐必填字段
3. agent 调 `prepare_create_part` 返回 `confirm_create`
4. 服务端发送预填确认卡片
5. 用户点击提交
6. 回调中调用 `createPart`
7. 返回结果卡片并写入会话记忆

## 配置说明

### Agent 配置 `config/agent.json`

- `allowedTools`: 工具白名单
- `maxSteps`: 单轮最大推理步数
- `maxHistory`: 每用户保留历史条数
- `maxRequestsPerMinute`: 每用户每分钟消息上限
- `systemPrompt`: 主题边界与行为约束

### 表单配置 `config/form-schema.json`

字段来源统一在 schema：
- `input`
- `select` + `optionSource.type = static | plm`

## 测试

```bash
npm test
```

关键门禁：

```bash
npm run doctor
npm run harness:check
npm run replay
npm run test:harness
npm run ci:check
```

当前覆盖：
- memory
- form-config
- tools
- agent
- card-template
- config
- plm-client
- message-utils
- handlers
- submit-parser
- topic-guard
- tracing
- audit-log
- audit-query
- audit-report
- dedupe
- keyed-queue
- doctor
- harness-check
- replay
- output-contract

## 注意

- 当前 `createPart` 默认请求 `/parts`；真实 PLM 对接时按接口文档调整映射。
- 飞书卡片 `select_static` 无可靠默认选中；确认依赖顶部摘要。

## 审计排障

日志默认写入 `data/audit/audit.jsonl`（可用 `AUDIT_LOG_PATH` 覆盖）。

可在命令行快速排查某次请求：

```bash
npm run audit:timeline -- --request-id msg_xxx --path data/audit/audit.jsonl
```

查看最近请求摘要（状态/事件数）：

```bash
npm run audit:summary -- --path data/audit/audit.jsonl --limit 10
```


## 启动前体检

```bash
npm run doctor
```

返回 0 表示配置可启动。
`npm start` 启动时也会执行同等体检，失败会直接退出。
仅跑静态门禁时可跳过环境变量：

```bash
node src/doctor-cli.js --skip-env
```

## CI 门禁

```bash
npm run ci:check
```

顺序执行：doctor → harness-check → replay → harness flow → 全量测试。

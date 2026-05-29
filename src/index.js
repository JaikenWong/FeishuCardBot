/**
 * 飞书机器人 - WebSocket 长连接模式
 *
 * 功能：
 * 1. 用户发送消息时，Agent 多轮对话收集物料字段
 * 2. 字段收集齐后弹预填确认卡片
 * 3. 用户确认后走卡片回调创建部件，返回结果卡片
 *
 * 启动方式：node src/index.js
 */

require('dotenv').config()
const {
  Client,
  WSClient,
  EventDispatcher,
  LoggerLevel,
} = require('@larksuiteoapi/node-sdk')
const OpenAI = require('openai')
const { createAgent } = require('./agent')
const { buildCreatePartCard, buildResultCard } = require('./card-template')
const { createPart } = require('./plm-client')
const formConfig = require('./form-config')
const { appendHistory } = require('./memory')
const { createHandlers } = require('./handlers')
const { createAuditLogger } = require('./audit-log')
const { runDoctor } = require('./doctor')
const agentConfig = require('../config/agent.json')

// ============================================
// 配置
// ============================================

const APP_ID = process.env.FEISHU_APP_ID
const APP_SECRET = process.env.FEISHU_APP_SECRET

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_MODEL = process.env.OPENAI_MODEL
const AUDIT_LOG_PATH = process.env.AUDIT_LOG_PATH || 'data/audit/audit.jsonl'

const formSchema = formConfig.loadSchema()
const runtimeAgentConfig = { ...agentConfig, model: agentConfig.model || OPENAI_MODEL }
const doctor = runDoctor({ schema: formSchema, agentConfig: runtimeAgentConfig })
if (!doctor.ok) {
  console.error('❌ 启动前体检失败')
  if (!doctor.envCheck.ok) console.error(`缺失环境变量: ${doctor.envCheck.missing.join(', ')}`)
  if (doctor.schemaError) console.error(`Schema 错误: ${doctor.schemaError}`)
  if (!doctor.cfgCheck.ok) console.error(`配置错误: ${doctor.cfgCheck.errors.join(' | ')}`)
  process.exit(1)
}

// ============================================
// 初始化飞书 Client
// ============================================

const client = new Client({
  appId: APP_ID,
  appSecret: APP_SECRET,
  appType: 0, // 自建应用
  domain: 0,  // Feishu
})

// ============================================
// 初始化 Agent
// ============================================

const openai = new OpenAI({ baseURL: OPENAI_BASE_URL, apiKey: OPENAI_API_KEY })
const audit = createAuditLogger({ filePath: AUDIT_LOG_PATH })
const agent = createAgent({
  openai,
  plmClient: require('./plm-client'),
  config: runtimeAgentConfig,
  schema: formSchema,
  trace: audit.trace,
})

const { handleMessage, handleCardCallback } = createHandlers({
  agent,
  client,
  buildCreatePartCard,
  buildResultCard,
  createPart,
  appendHistory,
  maxHistory: agentConfig.maxHistory,
  topicBoundary: agentConfig.topicBoundary,
  schema: formSchema,
  trace: audit.trace,
  callbackDedupeTtlMs: agentConfig.callbackDedupeTtlMs,
  maxRequestsPerMinute: agentConfig.maxRequestsPerMinute,
})

// ============================================
// 事件处理器
// ============================================

const eventDispatcher = new EventDispatcher({
  loggerLevel: LoggerLevel.info,
}).register({
  // 接收消息事件
  'im.message.receive_v1': async (data) => {
    console.log('📩 收到消息:', JSON.stringify(data, null, 2))
    await handleMessage(data)
  },
  // 接收卡片交互事件（表单提交/按钮点击）
  'card.action.trigger': async (data) => {
    console.log('🎴 收到卡片回调:', JSON.stringify(data, null, 2))
    await handleCardCallback(data)
    return {}
  },
})

// ============================================
// 启动 WebSocket 长连接
// ============================================

console.log('========================================')
console.log('🤖 飞书 PLM Agent - 对话式物料助手')
console.log('========================================')
console.log(`App ID: ${APP_ID}`)
console.log(`Model: ${OPENAI_MODEL}`)
console.log(`PLM API: ${process.env.PLM_API_BASE_URL || '(未配置)'}`)
console.log(`Allowed Tools: ${(agentConfig.allowedTools || []).join(', ')}`)
console.log(`Schema Fields: ${formSchema.fields.length}`)
console.log(`Required Fields: ${formSchema.fields.filter((f) => f.required).map((f) => f.name).join(', ')}`)
console.log('========================================')

const wsClient = new WSClient({
  appId: APP_ID,
  appSecret: APP_SECRET,
  domain: 0, // Feishu
  loggerLevel: LoggerLevel.info,
  onReady: () => {
    console.log('✅ WebSocket 连接成功，等待消息...')
  },
  onError: (err) => {
    console.error('❌ WebSocket 连接失败:', err)
  },
  onReconnecting: () => {
    console.log('⚠️ WebSocket 断开，正在重连...')
  },
  onReconnected: () => {
    console.log('🔄 WebSocket 重连成功')
  },
})

wsClient
  .start({
    eventDispatcher,
  })
  .catch((err) => {
    console.error('❌ 启动失败:', err)
    process.exit(1)
  })

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n👋 正在关闭...')
  wsClient.close({ force: true })
  process.exit(0)
})

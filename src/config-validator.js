const { ENDPOINT_MAP } = require('./form-config')
const { ALL_TOOLS } = require('./tools')
const FIELD_NAME_RE = /^[a-z][a-z0-9_]*$/
const MAX_FIELD_NAME_LEN = 40

const LIMITS = {
  maxSteps: { min: 1, max: 12 },
  maxHistory: { min: 1, max: 100 },
  openaiMaxRetries: { min: 0, max: 5 },
  callbackDedupeTtlMs: { min: 1000, max: 3600000 },
  maxRequestsPerMinute: { min: 1, max: 120 },
  maxToolArgsSize: { min: 256, max: 32768 },
  maxToolCallsPerStep: { min: 1, max: 20 },
}

const ALLOWED_AGENT_CONFIG_KEYS = new Set([
  'model',
  'systemPrompt',
  'topicBoundary',
  'allowedTools',
  'maxSteps',
  'maxHistory',
  'openaiMaxRetries',
  'maxToolArgsSize',
  'maxToolCallsPerStep',
  'callbackDedupeTtlMs',
  'maxRequestsPerMinute',
])

const REQUIRED_GUARD_KEYS = [
  'openaiMaxRetries',
  'maxToolArgsSize',
  'maxToolCallsPerStep',
  'callbackDedupeTtlMs',
  'maxRequestsPerMinute',
]

function validateAgentRuntimeConfig({ schema, agentConfig }) {
  const errors = []
  if (!schema || !Array.isArray(schema.fields)) errors.push('form-schema.fields 必须是数组')
  const cfg = agentConfig && typeof agentConfig === 'object' && !Array.isArray(agentConfig) ? agentConfig : {}
  if (agentConfig != null && (typeof agentConfig !== 'object' || Array.isArray(agentConfig))) {
    errors.push('agent 配置必须是对象')
  }
  const unknownKeys = Object.keys(cfg).filter((k) => !ALLOWED_AGENT_CONFIG_KEYS.has(k))
  if (unknownKeys.length > 0) {
    errors.push(`agent 配置含未知字段: ${unknownKeys.join(', ')}`)
  }
  for (const k of REQUIRED_GUARD_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(cfg, k)) {
      errors.push(`agent.${k} 必须显式配置`)
    }
  }
  if (!Object.prototype.hasOwnProperty.call(cfg, 'systemPrompt')) {
    errors.push('agent.systemPrompt 必须显式配置')
  } else if (typeof cfg.systemPrompt !== 'string' || cfg.systemPrompt.trim() === '') {
    errors.push('agent.systemPrompt 必须是非空字符串')
  }
  if (!Object.prototype.hasOwnProperty.call(cfg, 'topicBoundary')) {
    errors.push('agent.topicBoundary 必须显式配置')
  } else if (typeof cfg.topicBoundary !== 'string' || cfg.topicBoundary.trim() === '') {
    errors.push('agent.topicBoundary 必须是非空字符串')
  }

  const tools = cfg.allowedTools
  if (!Array.isArray(tools)) {
    errors.push('agent.allowedTools 必须是数组')
  } else {
    if (tools.length === 0) {
      errors.push('agent.allowedTools 不能为空')
    }
    const badTools = tools.filter((t) => typeof t !== 'string' || t.trim() === '')
    if (badTools.length > 0) {
      errors.push('agent.allowedTools 仅允许非空字符串')
    }
    const unknownTools = tools.filter((t) => !ALL_TOOLS[t])
    if (unknownTools.length > 0) {
      errors.push(`agent.allowedTools 含未知工具: ${unknownTools.join(', ')}`)
    }
    const dupTools = tools.filter((t, i) => tools.indexOf(t) !== i)
    if (dupTools.length > 0) {
      errors.push(`agent.allowedTools 含重复工具: ${Array.from(new Set(dupTools)).join(', ')}`)
    }
  }
  const requiredTools = ['list_field_options', 'prepare_create_part']
  if (Array.isArray(tools)) {
    for (const t of requiredTools) {
      if (!tools.includes(t)) errors.push(`agent.allowedTools 缺少: ${t}`)
    }
  }

  if (!(Number.isInteger(cfg.maxSteps) && cfg.maxSteps >= LIMITS.maxSteps.min && cfg.maxSteps <= LIMITS.maxSteps.max)) {
    errors.push(`agent.maxSteps 必须在 ${LIMITS.maxSteps.min}-${LIMITS.maxSteps.max} 之间`)
  }

  if (!(Number.isInteger(cfg.maxHistory) && cfg.maxHistory >= LIMITS.maxHistory.min && cfg.maxHistory <= LIMITS.maxHistory.max)) {
    errors.push(`agent.maxHistory 必须在 ${LIMITS.maxHistory.min}-${LIMITS.maxHistory.max} 之间`)
  }
  if (cfg.openaiMaxRetries != null && !(Number.isInteger(cfg.openaiMaxRetries) && cfg.openaiMaxRetries >= LIMITS.openaiMaxRetries.min && cfg.openaiMaxRetries <= LIMITS.openaiMaxRetries.max)) {
    errors.push(`agent.openaiMaxRetries 必须在 ${LIMITS.openaiMaxRetries.min}-${LIMITS.openaiMaxRetries.max} 之间`)
  }
  if (cfg.callbackDedupeTtlMs != null && !(Number.isInteger(cfg.callbackDedupeTtlMs) && cfg.callbackDedupeTtlMs >= LIMITS.callbackDedupeTtlMs.min && cfg.callbackDedupeTtlMs <= LIMITS.callbackDedupeTtlMs.max)) {
    errors.push(`agent.callbackDedupeTtlMs 必须在 ${LIMITS.callbackDedupeTtlMs.min}-${LIMITS.callbackDedupeTtlMs.max} 之间`)
  }
  if (cfg.maxRequestsPerMinute != null && !(Number.isInteger(cfg.maxRequestsPerMinute) && cfg.maxRequestsPerMinute >= LIMITS.maxRequestsPerMinute.min && cfg.maxRequestsPerMinute <= LIMITS.maxRequestsPerMinute.max)) {
    errors.push(`agent.maxRequestsPerMinute 必须在 ${LIMITS.maxRequestsPerMinute.min}-${LIMITS.maxRequestsPerMinute.max} 之间`)
  }
  if (cfg.maxToolArgsSize != null && !(Number.isInteger(cfg.maxToolArgsSize) && cfg.maxToolArgsSize >= LIMITS.maxToolArgsSize.min && cfg.maxToolArgsSize <= LIMITS.maxToolArgsSize.max)) {
    errors.push(`agent.maxToolArgsSize 必须在 ${LIMITS.maxToolArgsSize.min}-${LIMITS.maxToolArgsSize.max} 之间`)
  }
  if (cfg.maxToolCallsPerStep != null && !(Number.isInteger(cfg.maxToolCallsPerStep) && cfg.maxToolCallsPerStep >= LIMITS.maxToolCallsPerStep.min && cfg.maxToolCallsPerStep <= LIMITS.maxToolCallsPerStep.max)) {
    errors.push(`agent.maxToolCallsPerStep 必须在 ${LIMITS.maxToolCallsPerStep.min}-${LIMITS.maxToolCallsPerStep.max} 之间`)
  }

  const requiredFields = (schema?.fields || []).filter((f) => f.required)
  if (requiredFields.length === 0) errors.push('form-schema 至少要有一个 required 字段')
  const names = (schema?.fields || []).map((f) => f?.name).filter(Boolean)
  const dupNames = names.filter((x, i) => names.indexOf(x) !== i)
  if (dupNames.length > 0) errors.push(`form-schema 字段名重复: ${Array.from(new Set(dupNames)).join(', ')}`)

  const submitText = String(schema?.submit?.text || '').trim()
  if (!submitText) {
    errors.push('schema.submit.text 不能为空')
  } else if (submitText.length > 30) {
    errors.push('schema.submit.text 长度不能超过 30')
  }

  for (const f of schema?.fields || []) {
    if (!f.name) errors.push('form-schema 字段缺少 name')
    if (f?.name && (typeof f.name !== 'string' || !FIELD_NAME_RE.test(f.name) || f.name.length > MAX_FIELD_NAME_LEN)) {
      errors.push(`字段 ${f.name} name 格式非法`)
    }
    if (!['input', 'select'].includes(f.type)) errors.push(`字段 ${f.name || '(unknown)'} type 非法`)
    if (f.type === 'select' && !f.optionSource) errors.push(`字段 ${f.name} 为 select 时必须配置 optionSource`)
    if (f.type === 'select' && f.optionSource) {
      const src = f.optionSource || {}
      if (!['static', 'plm'].includes(src.type)) errors.push(`字段 ${f.name} optionSource.type 非法`)
      if (src.type === 'plm' && !ENDPOINT_MAP[src.endpoint]) errors.push(`字段 ${f.name} optionSource.endpoint 非法`)
      if (src.type === 'static' && (!Array.isArray(src.options) || src.options.length === 0)) {
        errors.push(`字段 ${f.name} optionSource.options 不能为空`)
      }
      if (src.type === 'static' && Array.isArray(src.options) && src.options.length > 0) {
        const badTextOptions = src.options.filter((opt) => {
          const text = String(opt?.text ?? '').trim()
          return !text || text.length > 30
        })
        if (badTextOptions.length > 0) errors.push(`字段 ${f.name} optionSource.options.text 非法`)
        const badValueOptions = src.options.filter((opt) => {
          const value = String(opt?.value ?? '').trim()
          return !value || value.length > 60
        })
        if (badValueOptions.length > 0) errors.push(`字段 ${f.name} optionSource.options.value 非法`)
        const values = src.options.map((opt) => String(opt?.value ?? '')).filter(Boolean)
        const dupValues = values.filter((v, i) => values.indexOf(v) !== i)
        if (dupValues.length > 0) errors.push(`字段 ${f.name} optionSource.options.value 重复: ${Array.from(new Set(dupValues)).join(', ')}`)
      }
    }
  }

  return { ok: errors.length === 0, errors }
}

function assertValidAgentRuntimeConfig(input) {
  const result = validateAgentRuntimeConfig(input)
  if (!result.ok) {
    throw new Error(`配置校验失败: ${result.errors.join('; ')}`)
  }
  return true
}

module.exports = { validateAgentRuntimeConfig, assertValidAgentRuntimeConfig }

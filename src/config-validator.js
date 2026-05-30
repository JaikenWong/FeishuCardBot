const LIMITS = {
  maxSteps: { min: 1, max: 12 },
  maxHistory: { min: 1, max: 100 },
  openaiMaxRetries: { min: 0, max: 5 },
  callbackDedupeTtlMs: { min: 1000, max: 3600000 },
  maxRequestsPerMinute: { min: 1, max: 120 },
  maxToolArgsSize: { min: 256, max: 32768 },
  maxToolCallsPerStep: { min: 1, max: 20 },
}

function validateAgentRuntimeConfig({ schema, agentConfig }) {
  const errors = []
  if (!schema || !Array.isArray(schema.fields)) errors.push('form-schema.fields 必须是数组')

  const tools = agentConfig?.allowedTools || []
  const requiredTools = ['list_field_options', 'prepare_create_part']
  for (const t of requiredTools) {
    if (!tools.includes(t)) errors.push(`agent.allowedTools 缺少: ${t}`)
  }

  if (!(Number.isInteger(agentConfig?.maxSteps) && agentConfig.maxSteps >= LIMITS.maxSteps.min && agentConfig.maxSteps <= LIMITS.maxSteps.max)) {
    errors.push(`agent.maxSteps 必须在 ${LIMITS.maxSteps.min}-${LIMITS.maxSteps.max} 之间`)
  }

  if (!(Number.isInteger(agentConfig?.maxHistory) && agentConfig.maxHistory >= LIMITS.maxHistory.min && agentConfig.maxHistory <= LIMITS.maxHistory.max)) {
    errors.push(`agent.maxHistory 必须在 ${LIMITS.maxHistory.min}-${LIMITS.maxHistory.max} 之间`)
  }
  if (agentConfig?.openaiMaxRetries != null && !(Number.isInteger(agentConfig.openaiMaxRetries) && agentConfig.openaiMaxRetries >= LIMITS.openaiMaxRetries.min && agentConfig.openaiMaxRetries <= LIMITS.openaiMaxRetries.max)) {
    errors.push(`agent.openaiMaxRetries 必须在 ${LIMITS.openaiMaxRetries.min}-${LIMITS.openaiMaxRetries.max} 之间`)
  }
  if (agentConfig?.callbackDedupeTtlMs != null && !(Number.isInteger(agentConfig.callbackDedupeTtlMs) && agentConfig.callbackDedupeTtlMs >= LIMITS.callbackDedupeTtlMs.min && agentConfig.callbackDedupeTtlMs <= LIMITS.callbackDedupeTtlMs.max)) {
    errors.push(`agent.callbackDedupeTtlMs 必须在 ${LIMITS.callbackDedupeTtlMs.min}-${LIMITS.callbackDedupeTtlMs.max} 之间`)
  }
  if (agentConfig?.maxRequestsPerMinute != null && !(Number.isInteger(agentConfig.maxRequestsPerMinute) && agentConfig.maxRequestsPerMinute >= LIMITS.maxRequestsPerMinute.min && agentConfig.maxRequestsPerMinute <= LIMITS.maxRequestsPerMinute.max)) {
    errors.push(`agent.maxRequestsPerMinute 必须在 ${LIMITS.maxRequestsPerMinute.min}-${LIMITS.maxRequestsPerMinute.max} 之间`)
  }
  if (agentConfig?.maxToolArgsSize != null && !(Number.isInteger(agentConfig.maxToolArgsSize) && agentConfig.maxToolArgsSize >= LIMITS.maxToolArgsSize.min && agentConfig.maxToolArgsSize <= LIMITS.maxToolArgsSize.max)) {
    errors.push(`agent.maxToolArgsSize 必须在 ${LIMITS.maxToolArgsSize.min}-${LIMITS.maxToolArgsSize.max} 之间`)
  }
  if (agentConfig?.maxToolCallsPerStep != null && !(Number.isInteger(agentConfig.maxToolCallsPerStep) && agentConfig.maxToolCallsPerStep >= LIMITS.maxToolCallsPerStep.min && agentConfig.maxToolCallsPerStep <= LIMITS.maxToolCallsPerStep.max)) {
    errors.push(`agent.maxToolCallsPerStep 必须在 ${LIMITS.maxToolCallsPerStep.min}-${LIMITS.maxToolCallsPerStep.max} 之间`)
  }

  const requiredFields = (schema?.fields || []).filter((f) => f.required)
  if (requiredFields.length === 0) errors.push('form-schema 至少要有一个 required 字段')

  for (const f of schema?.fields || []) {
    if (!f.name) errors.push('form-schema 字段缺少 name')
    if (!['input', 'select'].includes(f.type)) errors.push(`字段 ${f.name || '(unknown)'} type 非法`) 
    if (f.type === 'select' && !f.optionSource) errors.push(`字段 ${f.name} 为 select 时必须配置 optionSource`)
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

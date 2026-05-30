const formConfig = require('./form-config')
const agentConfig = require('../config/agent.json')
const { ALL_TOOLS } = require('./tools')

function runHarnessCheck({ schema = formConfig.loadSchema(), config = agentConfig } = {}) {
  const errors = []
  const allowedTools = Array.isArray(config.allowedTools) ? config.allowedTools : []
  const maxToolArgsSize = config.maxToolArgsSize

  if (allowedTools.length === 0) {
    errors.push('allowedTools 不能为空')
  }

  if (!allowedTools.includes('prepare_create_part')) {
    errors.push('必须允许 prepare_create_part（创建二次确认）')
  }
  if (!allowedTools.includes('list_field_options')) {
    errors.push('必须允许 list_field_options（字段选项查询）')
  }

  if (allowedTools.some((t) => /create_part|create_material/i.test(t) && t !== 'prepare_create_part')) {
    errors.push('禁止直接创建类 tool 出现在白名单')
  }
  const unknownTools = allowedTools.filter((t) => !ALL_TOOLS[t])
  if (unknownTools.length) {
    errors.push(`allowedTools 含未知工具: ${unknownTools.join(', ')}`)
  }
  const dupTools = allowedTools.filter((t, i) => allowedTools.indexOf(t) !== i)
  if (dupTools.length) {
    errors.push(`allowedTools 含重复工具: ${Array.from(new Set(dupTools)).join(', ')}`)
  }

  const requiredFields = (schema.fields || []).filter((f) => f.required)
  if (requiredFields.length === 0) {
    errors.push('schema 至少一个必填字段')
  }

  if (!schema.submit || schema.submit.action !== 'submit_create_part') {
    errors.push('submit.action 必须为 submit_create_part')
  }
  if (!Number.isInteger(maxToolArgsSize)) {
    errors.push('maxToolArgsSize 必须显式配置为整数')
  } else if (maxToolArgsSize < 256 || maxToolArgsSize > 32768) {
    errors.push('maxToolArgsSize 必须在 256-32768 之间')
  }
  if (!Number.isInteger(config.openaiMaxRetries) || config.openaiMaxRetries < 0 || config.openaiMaxRetries > 5) {
    errors.push('openaiMaxRetries 必须显式配置且在 0-5 之间')
  }
  if (!Number.isInteger(config.callbackDedupeTtlMs) || config.callbackDedupeTtlMs < 1000 || config.callbackDedupeTtlMs > 3600000) {
    errors.push('callbackDedupeTtlMs 必须显式配置且在 1000-3600000 之间')
  }
  if (!Number.isInteger(config.maxRequestsPerMinute) || config.maxRequestsPerMinute < 1 || config.maxRequestsPerMinute > 120) {
    errors.push('maxRequestsPerMinute 必须显式配置且在 1-120 之间')
  }
  if (!Number.isInteger(config.maxToolCallsPerStep) || config.maxToolCallsPerStep < 1 || config.maxToolCallsPerStep > 20) {
    errors.push('maxToolCallsPerStep 必须显式配置且在 1-20 之间')
  }
  if (!Number.isInteger(config.maxSteps) || config.maxSteps < 1 || config.maxSteps > 12) {
    errors.push('maxSteps 必须显式配置且在 1-12 之间')
  }
  if (!Number.isInteger(config.maxHistory) || config.maxHistory < 1 || config.maxHistory > 100) {
    errors.push('maxHistory 必须显式配置且在 1-100 之间')
  }

  return { ok: errors.length === 0, errors }
}

module.exports = { runHarnessCheck }

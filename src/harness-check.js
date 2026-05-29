const formConfig = require('./form-config')
const agentConfig = require('../config/agent.json')
const { ALL_TOOLS } = require('./tools')

function runHarnessCheck({ schema = formConfig.loadSchema(), config = agentConfig } = {}) {
  const errors = []
  const allowedTools = Array.isArray(config.allowedTools) ? config.allowedTools : []

  if (allowedTools.length === 0) {
    errors.push('allowedTools 不能为空')
  }

  if (!allowedTools.includes('prepare_create_part')) {
    errors.push('必须允许 prepare_create_part（创建二次确认）')
  }

  if (allowedTools.some((t) => /create_part|create_material/i.test(t) && t !== 'prepare_create_part')) {
    errors.push('禁止直接创建类 tool 出现在白名单')
  }
  const unknownTools = allowedTools.filter((t) => !ALL_TOOLS[t])
  if (unknownTools.length) {
    errors.push(`allowedTools 含未知工具: ${unknownTools.join(', ')}`)
  }

  const requiredFields = (schema.fields || []).filter((f) => f.required)
  if (requiredFields.length === 0) {
    errors.push('schema 至少一个必填字段')
  }

  if (!schema.submit || schema.submit.action !== 'submit_create_part') {
    errors.push('submit.action 必须为 submit_create_part')
  }

  return { ok: errors.length === 0, errors }
}

module.exports = { runHarnessCheck }

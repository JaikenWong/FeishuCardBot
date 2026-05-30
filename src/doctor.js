const path = require('path')
const fs = require('fs')
const { loadSchema } = require('./form-config')
const { validateAgentRuntimeConfig } = require('./config-validator')
const { runHarnessCheck } = require('./harness-check')
const { ENDPOINT_MAP } = require('./form-config')
const { checkReplayFixtures } = require('./replay-fixture-check')

const REQUIRED_ENV = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL']

function checkEnv(env = process.env) {
  const missing = REQUIRED_ENV.filter((k) => !env[k])
  return { ok: missing.length === 0, missing }
}

function loadAgentConfig(configPath) {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}

function runStrictChecks({ schema, config, replayFixtureDir }) {
  const errors = []
  const fields = Array.isArray(schema?.fields) ? schema.fields : []
  const names = fields.map((f) => f?.name).filter(Boolean)
  const dupNames = names.filter((x, i) => names.indexOf(x) !== i)
  if (dupNames.length > 0) {
    errors.push(`schema 字段名重复: ${Array.from(new Set(dupNames)).join(', ')}`)
  }

  for (const f of fields) {
    const fieldName = String(f?.name || '')
    if (!fieldName) {
      errors.push('字段 name 不能为空')
    } else {
      if (!/^[a-z][a-z0-9_]*$/.test(fieldName)) {
        errors.push(`字段 ${fieldName} name 格式非法（仅小写字母/数字/下划线，且字母开头）`)
      }
      if (fieldName.length > 40) {
        errors.push(`字段 ${fieldName} name 长度不能超过 40`)
      }
    }

    const label = String(f?.label || '').trim()
    const placeholder = String(f?.placeholder || '').trim()
    if (!label) {
      errors.push(`字段 ${f?.name || '(unknown)'} label 不能为空`)
    } else if (label.length > 30) {
      errors.push(`字段 ${f.name} label 长度不能超过 30`)
    }
    if (f?.type === 'input' || f?.type === 'select') {
      if (!placeholder) errors.push(`字段 ${f.name} placeholder 不能为空`)
      else if (placeholder.length > 60) errors.push(`字段 ${f.name} placeholder 长度不能超过 60`)
    }

    if (f?.type !== 'select') continue
    const src = f.optionSource || {}
    if (!['static', 'plm'].includes(src.type)) {
      errors.push(`字段 ${f.name} optionSource.type 非法`)
      continue
    }
    if (src.type === 'plm' && !ENDPOINT_MAP[src.endpoint]) {
      errors.push(`字段 ${f.name} 使用未知 endpoint: ${src.endpoint}`)
    }
    if (src.type === 'static' && (!Array.isArray(src.options) || src.options.length === 0)) {
      errors.push(`字段 ${f.name} static options 不能为空`)
    }
    if (src.type === 'static' && Array.isArray(src.options) && src.options.length > 0) {
      const badTextOptions = src.options.filter((opt) => {
        const text = String(opt?.text ?? '').trim()
        return !text || text.length > 30
      })
      if (badTextOptions.length > 0) {
        errors.push(`字段 ${f.name} static options text 非法（不能为空且长度<=30）`)
      }
      const badValueOptions = src.options.filter((opt) => {
        const value = String(opt?.value ?? '').trim()
        return !value || value.length > 60
      })
      if (badValueOptions.length > 0) {
        errors.push(`字段 ${f.name} static options value 非法（不能为空且长度<=60）`)
      }
      const values = src.options.map((opt) => String(opt?.value ?? '')).filter(Boolean)
      const dupValues = values.filter((v, i) => values.indexOf(v) !== i)
      if (dupValues.length > 0) {
        errors.push(`字段 ${f.name} static options value 重复: ${Array.from(new Set(dupValues)).join(', ')}`)
      }
    }
  }

  if (!config?.systemPrompt || typeof config.systemPrompt !== 'string') {
    errors.push('agent.systemPrompt 不能为空')
  }
  if (typeof config?.model !== 'string') {
    errors.push('agent.model 必须是字符串（可为空，运行时走 env）')
  }
  const submitText = String(schema?.submit?.text || '').trim()
  if (!submitText) {
    errors.push('schema.submit.text 不能为空')
  } else if (submitText.length > 30) {
    errors.push('schema.submit.text 长度不能超过 30')
  }
  const replayCheck = checkReplayFixtures({ fixtureDir: replayFixtureDir })
  if (!replayCheck.ok) {
    errors.push(...replayCheck.errors)
  }

  return { ok: errors.length === 0, errors }
}

function runDoctor({
  env = process.env,
  schemaPath = path.join(__dirname, '..', 'config', 'form-schema.json'),
  schema: inputSchema,
  configPath = path.join(__dirname, '..', 'config', 'agent.json'),
  agentConfig,
  skipEnv = false,
  strict = false,
  replayFixtureDir = path.join(__dirname, '..', 'test', 'fixtures'),
} = {}) {
  const envCheck = skipEnv ? { ok: true, missing: [] } : checkEnv(env)
  let schema = inputSchema || null
  let schemaError = null
  if (!schema) {
    try {
      schema = loadSchema(schemaPath)
    } catch (e) {
      schemaError = e.message
    }
  }

  let cfg = agentConfig || null
  let configError = null
  if (!cfg) {
    try {
      cfg = loadAgentConfig(configPath)
    } catch (e) {
      configError = e.message
    }
  }

  if (!cfg) cfg = {}
  const cfgCheck = schema ? validateAgentRuntimeConfig({ schema, agentConfig: cfg }) : { ok: false, errors: ['schema 加载失败'] }
  const harnessCheck = schema ? runHarnessCheck({ schema, config: cfg }) : { ok: false, errors: ['schema 加载失败'] }
  const strictCheck = strict && schema ? runStrictChecks({ schema, config: cfg, replayFixtureDir }) : { ok: true, errors: [] }

  const ok = envCheck.ok && !schemaError && !configError && cfgCheck.ok && harnessCheck.ok && strictCheck.ok
  return {
    ok,
    envCheck,
    schemaError,
    configError,
    cfgCheck,
    harnessCheck,
    strictCheck,
    summary: ok ? 'OK' : 'FAIL',
  }
}

module.exports = { REQUIRED_ENV, checkEnv, runDoctor, loadAgentConfig, runStrictChecks }

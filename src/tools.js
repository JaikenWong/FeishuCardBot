/**
 * Agent 工具：定义 OpenAI tool schema + 执行处理器。
 * 白名单外的 tool 一律拒绝。创建物料不在此直接发生——
 * prepare_create_part 只返回卡片动作，真正创建走卡片回调。
 */
const formConfig = require('./form-config')
const FIELD_NAME_RE = /^[a-z][a-z0-9_]*$/
const MAX_FIELD_NAME_LEN = 40
const MAX_VALUE_LEN = 200

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

function normalizeString(v) {
  return typeof v === 'string' ? v.trim() : v
}

function normalizeFieldValue(v) {
  if (v == null) return null
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return undefined
}

async function executeTool(name, args, deps) {
  const { schema, client } = deps
  if (name === 'list_field_options') {
    const fieldArg = normalizeString(args?.field || '')
    if (!fieldArg || typeof fieldArg !== 'string') {
      return { result: { error: 'field 参数不能为空' } }
    }
    if (fieldArg.length > MAX_FIELD_NAME_LEN || !FIELD_NAME_RE.test(fieldArg)) {
      return { result: { error: 'field 参数格式非法' } }
    }
    const field = schema.fields.find((f) => f.name === fieldArg)
    if (!field) return { result: { error: `未知字段: ${args.field}` } }
    const { options, unavailable } = await formConfig.resolveFieldOptions(field, client)
    return { result: { field: fieldArg, options, unavailable } }
  }
  if (name === 'prepare_create_part') {
    if (!args?.values || typeof args.values !== 'object' || Array.isArray(args.values)) {
      return { result: { error: 'values 参数必须是对象' } }
    }
    const allowedFields = new Set(schema.fields.map((f) => f.name))
    const values = {}
    for (const [k, v] of Object.entries(args.values)) {
      if (!allowedFields.has(k)) return { result: { error: `未知字段: ${k}` } }
      const val = normalizeFieldValue(v)
      if (val === undefined) {
        return { result: { error: `字段 ${k} 值类型非法` } }
      }
      if (typeof val === 'string' && val.length > MAX_VALUE_LEN) {
        return { result: { error: `字段 ${k} 值过长` } }
      }
      values[k] = val
    }
    const required = schema.fields.filter((f) => f.required).map((f) => f.name)
    const missing = required.filter((n) => {
      const v = values[n]
      return v == null || String(v).trim() === ''
    })
    if (missing.length) return { result: { error: `缺少必填字段: ${missing.join(', ')}` } }
    return { cardAction: { type: 'confirm_create', values } }
  }
  throw new Error(`tool not allowed: ${name}`)
}

module.exports = { getToolDefinitions, executeTool, ALL_TOOLS }

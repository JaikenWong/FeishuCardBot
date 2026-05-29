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
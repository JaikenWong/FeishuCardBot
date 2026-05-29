const { test } = require('node:test')
const assert = require('node:assert')
const { getToolDefinitions, executeTool } = require('../src/tools')

const schema = { fields: [
  { name: 'material_name', type: 'input', required: true },
  { name: 'project_number', type: 'select', required: true, optionSource: { type: 'static', options: [{ text: 'P1', value: 'p1' }] } },
  { name: 'note', type: 'input', required: false },
] }

test('getToolDefinitions 仅返回白名单内 tool', () => {
  const defs = getToolDefinitions(['list_field_options'])
  assert.strictEqual(defs.length, 1)
  assert.strictEqual(defs[0].function.name, 'list_field_options')
})

test('list_field_options 返回字段选项', async () => {
  const out = await executeTool('list_field_options', { field: 'project_number' }, { schema, client: {} })
  assert.deepStrictEqual(out.result.options, [{ text: 'P1', value: 'p1' }])
})

test('list_field_options 未知字段返回 error', async () => {
  const out = await executeTool('list_field_options', { field: 'nope' }, { schema, client: {} })
  assert.ok(out.result.error)
})

test('list_field_options 非法 field 参数返回 error', async () => {
  const out1 = await executeTool('list_field_options', { field: '' }, { schema, client: {} })
  assert.ok(out1.result.error.includes('不能为空'))
  const out2 = await executeTool('list_field_options', { field: 'Bad-Name' }, { schema, client: {} })
  assert.ok(out2.result.error.includes('格式非法'))
})

test('prepare_create_part 缺必填返回 error', async () => {
  const out = await executeTool('prepare_create_part', { values: { material_name: '板' } }, { schema, client: {} })
  assert.ok(out.result.error.includes('project_number'))
})

test('prepare_create_part 字段齐返回 confirm_create 卡片动作', async () => {
  const values = { material_name: '板', project_number: 'p1' }
  const out = await executeTool('prepare_create_part', { values }, { schema, client: {} })
  assert.deepStrictEqual(out.cardAction, { type: 'confirm_create', values })
})

test('prepare_create_part values 非对象返回 error', async () => {
  const out = await executeTool('prepare_create_part', { values: [] }, { schema, client: {} })
  assert.ok(out.result.error.includes('必须是对象'))
})

test('prepare_create_part 含未知字段返回 error', async () => {
  const out = await executeTool('prepare_create_part', { values: { material_name: '板', project_number: 'p1', hack: 'x' } }, { schema, client: {} })
  assert.ok(out.result.error.includes('未知字段'))
})

test('prepare_create_part 字段值过长返回 error', async () => {
  const out = await executeTool('prepare_create_part', {
    values: { material_name: 'x'.repeat(201), project_number: 'p1' },
  }, { schema, client: {} })
  assert.ok(out.result.error.includes('值过长'))
})

test('白名单外 tool name 抛错', async () => {
  await assert.rejects(() => executeTool('rm_rf', {}, { schema, client: {} }))
})

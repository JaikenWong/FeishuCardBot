const { test } = require('node:test')
const assert = require('node:assert')
const { resolveFields, resolveFieldOptions, normalizeOption } = require('../src/form-config')

test('normalizeOption 兼容 label/name/id 字段名', () => {
  assert.deepStrictEqual(normalizeOption({ label: '设计视图', value: 'design' }), { text: '设计视图', value: 'design' })
  assert.deepStrictEqual(normalizeOption({ name: 'A', id: 'a' }), { text: 'A', value: 'a' })
})

test('static 字段直接取 options', async () => {
  const field = { type: 'select', optionSource: { type: 'static', options: [{ text: 'X', value: 'x' }] } }
  const r = await resolveFieldOptions(field, {})
  assert.deepStrictEqual(r, { options: [{ text: 'X', value: 'x' }], unavailable: false })
})

test('plm 字段调对应 client 函数并归一化', async () => {
  const fakeClient = { getProjectOptions: async () => [{ text: 'PRJ-1', value: 'p1' }] }
  const field = { type: 'select', optionSource: { type: 'plm', endpoint: 'projects' } }
  const r = await resolveFieldOptions(field, fakeClient)
  assert.deepStrictEqual(r.options, [{ text: 'PRJ-1', value: 'p1' }])
  assert.strictEqual(r.unavailable, false)
})

test('plm 拉取为空标记 unavailable', async () => {
  const fakeClient = { getProjectOptions: async () => [] }
  const field = { type: 'select', optionSource: { type: 'plm', endpoint: 'projects' } }
  const r = await resolveFieldOptions(field, fakeClient)
  assert.deepStrictEqual(r.options, [])
  assert.strictEqual(r.unavailable, true)
})

test('plm 拉取抛错标记 unavailable', async () => {
  const fakeClient = { getProjectOptions: async () => { throw new Error('down') } }
  const field = { type: 'select', optionSource: { type: 'plm', endpoint: 'projects' } }
  const r = await resolveFieldOptions(field, fakeClient)
  assert.strictEqual(r.unavailable, true)
})

test('resolveFields 处理整 schema，input 字段不带 options', async () => {
  const schema = { fields: [
    { name: 'material_name', type: 'input' },
    { name: 'view', type: 'select', optionSource: { type: 'static', options: [{ text: 'X', value: 'x' }] } },
  ] }
  const resolved = await resolveFields(schema, {})
  assert.strictEqual(resolved[0].options, undefined)
  assert.deepStrictEqual(resolved[1].options, [{ text: 'X', value: 'x' }])
})
const { test } = require('node:test')
const assert = require('node:assert')
const { pickRequiredFieldNames, validateRequiredValues, mapToPartData, parseSubmitForm } = require('../src/submit-parser')

const schema = {
  fields: [
    { name: 'material_name', required: true },
    { name: 'project_number', required: true },
    { name: 'view', required: false },
  ],
}

test('pickRequiredFieldNames 提取必填字段', () => {
  assert.deepStrictEqual(pickRequiredFieldNames(schema), ['material_name', 'project_number'])
})

test('validateRequiredValues 缺字段时返回 missing', () => {
  const r = validateRequiredValues({ material_name: '板' }, ['material_name', 'project_number'])
  assert.strictEqual(r.ok, false)
  assert.deepStrictEqual(r.missing, ['project_number'])
})

test('mapToPartData 映射为 PLM payload', () => {
  const out = mapToPartData({ material_name: '板', project_number: 'P1', x: 'y' })
  assert.deepStrictEqual(out, { materialName: '板', projectNumber: 'P1' })
})

test('parseSubmitForm 整体流程', () => {
  const out = parseSubmitForm({ material_name: '板', project_number: 'P1' }, schema)
  assert.strictEqual(out.ok, true)
  assert.strictEqual(out.partData.materialName, '板')
})

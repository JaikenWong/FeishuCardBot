const { test } = require('node:test')
const assert = require('node:assert')

// mock form-config，避免读真实文件/调 PLM
const formConfig = require('../src/form-config')
const schema = {
  header: { title: 'T', template: 'blue' },
  submit: { text: '✅ 确定创建', action: 'submit_create_part' },
  fields: [
    { name: 'material_name', type: 'input', label: '物料名称', placeholder: '输入', required: true, maxLength: 100 },
    { name: 'project_number', type: 'select', label: '项目号', placeholder: '选择', required: true },
  ],
}
formConfig.loadSchema = () => schema
formConfig.resolveFields = async () => [
  { name: 'material_name', type: 'input', label: '物料名称', placeholder: '输入', required: true, maxLength: 100 },
  { name: 'project_number', type: 'select', label: '项目号', placeholder: '选择', required: true, options: [{ text: 'P1', value: 'p1' }], unavailable: false },
]

const { buildCreatePartCard } = require('../src/card-template')

function findForm(card) {
  return card.body.elements.find((e) => e.tag === 'form')
}

test('生成卡片含 form + 提交按钮（form_action_type submit）', async () => {
  const card = await buildCreatePartCard()
  assert.strictEqual(card.schema, '2.0')
  const form = findForm(card)
  const btn = form.elements.find((e) => e.tag === 'button')
  assert.strictEqual(btn.form_action_type, 'submit')
  assert.strictEqual(btn.behaviors[0].value.action, 'submit_create_part')
})

test('input 字段 prefill 用 default_value', async () => {
  const card = await buildCreatePartCard({ material_name: '主控板' })
  const form = findForm(card)
  const input = form.elements.find((e) => e.tag === 'input' && e.name === 'material_name')
  assert.strictEqual(input.default_value, '主控板')
})

test('prefill 非空时含只读摘要块', async () => {
  const card = await buildCreatePartCard({ material_name: '主控板', project_number: 'p1' })
  const json = JSON.stringify(card)
  assert.ok(json.includes('主控板'))
  assert.ok(json.includes('待确认') || json.includes('确认'))
})

test('select 字段 unavailable 时 placeholder 提示不可用', async () => {
  formConfig.resolveFields = async () => [
    { name: 'project_number', type: 'select', label: '项目号', placeholder: '选择', required: true, options: [], unavailable: true },
  ]
  const card = await buildCreatePartCard()
  const json = JSON.stringify(card)
  assert.ok(json.includes('暂无可用选项'))
})
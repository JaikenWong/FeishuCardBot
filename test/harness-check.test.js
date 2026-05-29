const { test } = require('node:test')
const assert = require('node:assert')
const { runHarnessCheck } = require('../src/harness-check')

test('harness-check 正常配置通过', () => {
  const schema = { submit: { action: 'submit_create_part' }, fields: [{ name: 'material_name', required: true }] }
  const config = { allowedTools: ['list_field_options', 'prepare_create_part'] }
  const out = runHarnessCheck({ schema, config })
  assert.strictEqual(out.ok, true)
})

test('harness-check 识别直接创建工具违规', () => {
  const schema = { submit: { action: 'submit_create_part' }, fields: [{ name: 'material_name', required: true }] }
  const config = { allowedTools: ['create_part'] }
  const out = runHarnessCheck({ schema, config })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('禁止直接创建类 tool')))
})

test('harness-check 识别 submit action 违规', () => {
  const schema = { submit: { action: 'bad_action' }, fields: [{ name: 'material_name', required: true }] }
  const config = { allowedTools: ['prepare_create_part'] }
  const out = runHarnessCheck({ schema, config })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('submit.action')))
})

test('harness-check 识别未知工具名', () => {
  const schema = { submit: { action: 'submit_create_part' }, fields: [{ name: 'material_name', required: true }] }
  const config = { allowedTools: ['list_field_options', 'not_exist_tool'] }
  const out = runHarnessCheck({ schema, config })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('未知工具')))
})

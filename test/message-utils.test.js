const { test } = require('node:test')
const assert = require('node:assert')
const {
  extractOpenId,
  extractChatId,
  extractMessageText,
  extractSubmitFormValue,
} = require('../src/message-utils')

test('extractOpenId 兼容 event 包裹结构', () => {
  const payload = { event: { sender: { sender_id: { open_id: 'ou_1' } } } }
  assert.strictEqual(extractOpenId(payload), 'ou_1')
})

test('extractOpenId 兼容 card callback operator', () => {
  const payload = { operator: { open_id: 'ou_2' } }
  assert.strictEqual(extractOpenId(payload), 'ou_2')
})

test('extractChatId 读取消息 chat_id', () => {
  const payload = { event: { message: { chat_id: 'oc_1' } } }
  assert.strictEqual(extractChatId(payload), 'oc_1')
})

test('extractMessageText 提取 text 字段并 trim', () => {
  const payload = { event: { message: { content: JSON.stringify({ text: ' 你好 ' }) } } }
  assert.strictEqual(extractMessageText(payload), '你好')
})

test('extractMessageText 遇到非 JSON 返回空', () => {
  const payload = { message: { content: 'hello' } }
  assert.strictEqual(extractMessageText(payload), '')
})

test('extractSubmitFormValue 兼容 action.form_value', () => {
  const payload = { action: { form_value: { material_name: '板' } } }
  assert.deepStrictEqual(extractSubmitFormValue(payload), { material_name: '板' })
})

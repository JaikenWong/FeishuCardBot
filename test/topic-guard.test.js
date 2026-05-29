const { test } = require('node:test')
const assert = require('node:assert')
const { isLikelyPlmTopic, isLikelyOffTopic, shouldRejectTopic, defaultRejectReply } = require('../src/topic-guard')

test('PLM 关键词识别', () => {
  assert.strictEqual(isLikelyPlmTopic('帮我创建物料'), true)
  assert.strictEqual(isLikelyPlmTopic('project number options'), true)
})

test('无关话题识别', () => {
  assert.strictEqual(isLikelyOffTopic('今天天气怎么样'), true)
  assert.strictEqual(isLikelyOffTopic('movie recommend'), true)
})

test('拒绝策略：PLM 不拒绝，无关拒绝', () => {
  assert.strictEqual(shouldRejectTopic('查询项目号'), false)
  assert.strictEqual(shouldRejectTopic('聊聊股票'), true)
})

test('拒绝文案包含边界', () => {
  assert.match(defaultRejectReply('PLM领域'), /PLM领域/)
})

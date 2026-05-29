const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  parseAuditLines,
  readAuditFile,
  groupByRequestId,
  getRequestTimeline,
  checkRequestCompleteness,
} = require('../src/audit-query')

const sample = [
  JSON.stringify({ ts: '2026-01-01T00:00:00.000Z', event: 'handler.message.agent_run', payload: { requestId: 'r1' } }),
  JSON.stringify({ ts: '2026-01-01T00:00:01.000Z', event: 'agent.run.start', payload: { requestId: 'r1' } }),
  JSON.stringify({ ts: '2026-01-01T00:00:02.000Z', event: 'agent.run.end', payload: { requestId: 'r1' } }),
  JSON.stringify({ ts: '2026-01-01T00:00:03.000Z', event: 'agent.run.start', payload: { requestId: 'r2' } }),
].join('\n')

test('parseAuditLines 解析有效 JSON 行', () => {
  const rows = parseAuditLines(sample + '\nnot-json')
  assert.strictEqual(rows.length, 4)
})

test('readAuditFile 文件不存在返回空', () => {
  assert.deepStrictEqual(readAuditFile('/no/such/file.jsonl'), [])
})

test('groupByRequestId 分组', () => {
  const rows = parseAuditLines(sample)
  const grouped = groupByRequestId(rows)
  assert.strictEqual(grouped.get('r1').length, 3)
  assert.strictEqual(grouped.get('r2').length, 1)
})

test('getRequestTimeline 返回单请求轨迹', () => {
  const rows = parseAuditLines(sample)
  const timeline = getRequestTimeline(rows, 'r1')
  assert.strictEqual(timeline.length, 3)
})

test('checkRequestCompleteness 返回关键节点状态', () => {
  const rows = parseAuditLines(sample)
  const c = checkRequestCompleteness(getRequestTimeline(rows, 'r1'))
  assert.strictEqual(c.hasHandlerStart, true)
  assert.strictEqual(c.hasAgentStart, true)
  assert.strictEqual(c.hasAgentEnd, true)
  assert.strictEqual(c.hasTimeout, false)
})

test('readAuditFile 正常读取', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aq-'))
  const f = path.join(dir, 'audit.jsonl')
  fs.writeFileSync(f, sample + '\n', 'utf8')
  const rows = readAuditFile(f)
  assert.strictEqual(rows.length, 4)
})

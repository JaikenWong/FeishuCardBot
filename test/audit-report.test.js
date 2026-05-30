const { test } = require('node:test')
const assert = require('node:assert')
const { calcDurationMs, pickRangeTs, inferStatus, summarizeRequest, buildAuditReport } = require('../src/audit-report')

function rec(ts, event, requestId) {
  return { ts, event, payload: { requestId } }
}

test('inferStatus: ok/error/timeout/incomplete', () => {
  assert.strictEqual(inferStatus([
    rec('2026-01-01T00:00:00.000Z', 'handler.message.agent_run', 'r1'),
    rec('2026-01-01T00:00:01.000Z', 'agent.run.start', 'r1'),
    rec('2026-01-01T00:00:02.000Z', 'agent.run.end', 'r1'),
  ]), 'ok')

  assert.strictEqual(inferStatus([
    rec('2026-01-01T00:00:00.000Z', 'agent.run.error', 'r2'),
  ]), 'error')

  assert.strictEqual(inferStatus([
    rec('2026-01-01T00:00:00.000Z', 'agent.run.timeout', 'r3'),
  ]), 'timeout')

  assert.strictEqual(inferStatus([
    rec('2026-01-01T00:00:00.000Z', 'agent.run.start', 'r4'),
  ]), 'incomplete')
})

test('summarizeRequest 汇总基础字段', () => {
  const rows = [
    rec('2026-01-01T00:00:00.000Z', 'agent.run.start', 'r1'),
    rec('2026-01-01T00:00:00.500Z', 'agent.tool.error', 'r1'),
    rec('2026-01-01T00:00:00.600Z', 'agent.tool.result_error', 'r1'),
    rec('2026-01-01T00:00:01.000Z', 'agent.run.end', 'r1'),
  ]
  const s = summarizeRequest('r1', rows)
  assert.strictEqual(s.requestId, 'r1')
  assert.strictEqual(s.eventCount, 4)
  assert.strictEqual(s.firstTs, '2026-01-01T00:00:00.000Z')
  assert.strictEqual(s.lastTs, '2026-01-01T00:00:01.000Z')
  assert.strictEqual(s.durationMs, 1000)
  assert.strictEqual(s.toolErrorCount, 1)
  assert.strictEqual(s.toolResultErrorCount, 1)
  assert.strictEqual(s.openaiErrorCount, 0)
})

test('buildAuditReport 按 lastTs 倒序并 limit', () => {
  const rows = [
    rec('2026-01-01T00:00:00.000Z', 'agent.run.start', 'a'),
    rec('2026-01-01T00:00:03.000Z', 'agent.run.end', 'a'),
    rec('2026-01-01T00:00:00.000Z', 'agent.run.start', 'b'),
    rec('2026-01-01T00:00:04.000Z', 'agent.run.end', 'b'),
  ]
  const out = buildAuditReport(rows, { limit: 1 })
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0].requestId, 'b')
})

test('calcDurationMs 非法时间返回 null', () => {
  assert.strictEqual(calcDurationMs('bad', '2026-01-01T00:00:01.000Z'), null)
  assert.strictEqual(calcDurationMs('2026-01-01T00:00:01.000Z', ''), null)
})

test('buildAuditReport 同 lastTs 时按 requestId 稳定排序', () => {
  const rows = [
    rec('2026-01-01T00:00:00.000Z', 'agent.run.start', 'b'),
    rec('2026-01-01T00:00:03.000Z', 'agent.run.end', 'b'),
    rec('2026-01-01T00:00:01.000Z', 'agent.run.start', 'a'),
    rec('2026-01-01T00:00:03.000Z', 'agent.run.end', 'a'),
  ]
  const out = buildAuditReport(rows, { limit: 10 })
  assert.strictEqual(out[0].requestId, 'a')
  assert.strictEqual(out[1].requestId, 'b')
})

test('pickRangeTs 对乱序日志取真实首末时间', () => {
  const rows = [
    rec('2026-01-01T00:00:03.000Z', 'agent.run.end', 'r1'),
    rec('2026-01-01T00:00:01.000Z', 'agent.run.start', 'r1'),
    rec('2026-01-01T00:00:02.000Z', 'agent.step.final_reply', 'r1'),
  ]
  const r = pickRangeTs(rows)
  assert.strictEqual(r.firstTs, '2026-01-01T00:00:01.000Z')
  assert.strictEqual(r.lastTs, '2026-01-01T00:00:03.000Z')
  const s = summarizeRequest('r1', rows)
  assert.strictEqual(s.durationMs, 2000)
})

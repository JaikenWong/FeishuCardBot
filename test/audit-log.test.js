const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createAuditLogger } = require('../src/audit-log')

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'))
  return path.join(dir, 'audit.jsonl')
}

test('audit logger 写入 JSONL', () => {
  const f = tmpFile()
  const logger = createAuditLogger({ filePath: f, now: () => '2026-01-01T00:00:00.000Z' })
  logger.log('x', { a: 1 })
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n')
  assert.strictEqual(lines.length, 1)
  const obj = JSON.parse(lines[0])
  assert.strictEqual(obj.ts, '2026-01-01T00:00:00.000Z')
  assert.strictEqual(obj.event, 'x')
  assert.deepStrictEqual(obj.payload, { a: 1 })
})

test('audit trace 代理到 log', () => {
  const f = tmpFile()
  const logger = createAuditLogger({ filePath: f })
  logger.trace('agent.run.start', { openId: 'u1' })
  const obj = JSON.parse(fs.readFileSync(f, 'utf8').trim())
  assert.strictEqual(obj.event, 'agent.run.start')
})

test('audit logger 遇到循环引用 payload 可安全落盘', () => {
  const f = tmpFile()
  const logger = createAuditLogger({ filePath: f })
  const loop = {}
  loop.self = loop
  logger.log('x', loop)
  const obj = JSON.parse(fs.readFileSync(f, 'utf8').trim())
  assert.strictEqual(obj.payload.self, '[Circular]')
})

test('audit logger 自动脱敏敏感字段', () => {
  const f = tmpFile()
  const logger = createAuditLogger({ filePath: f })
  logger.log('x', {
    apiKey: 'sk-123',
    nested: { token: 'abc', value: 1 },
    keep: 'ok',
  })
  const obj = JSON.parse(fs.readFileSync(f, 'utf8').trim())
  assert.strictEqual(obj.payload.apiKey, '[REDACTED]')
  assert.strictEqual(obj.payload.nested.token, '[REDACTED]')
  assert.strictEqual(obj.payload.keep, 'ok')
})

const { test } = require('node:test')
const assert = require('node:assert')
const { execFileSync } = require('node:child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

function mkAudit() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-cli-'))
  const f = path.join(dir, 'audit.jsonl')
  const lines = [
    JSON.stringify({ ts: '2026-01-01T00:00:00.000Z', event: 'handler.message.agent_run', payload: { requestId: 'r1' } }),
    JSON.stringify({ ts: '2026-01-01T00:00:01.000Z', event: 'agent.run.start', payload: { requestId: 'r1' } }),
    JSON.stringify({ ts: '2026-01-01T00:00:02.000Z', event: 'agent.run.end', payload: { requestId: 'r1' } }),
  ]
  fs.writeFileSync(f, lines.join('\n') + '\n', 'utf8')
  return f
}

test('audit-cli summary 可执行', () => {
  const f = mkAudit()
  const out = execFileSync('node', ['src/audit-cli.js', 'summary', '--path', f, '--limit', '5'], { encoding: 'utf8' })
  assert.match(out, /r1/)
  assert.match(out, /durationMs/)
  assert.match(out, /2000/)
  assert.match(out, /toolErrorCount/)
  assert.match(out, /toolResultErrorCount/)
  assert.match(out, /openaiErrorCount/)
})

test('audit-cli timeline 可执行', () => {
  const f = mkAudit()
  const out = execFileSync('node', ['src/audit-cli.js', 'timeline', '--path', f, '--request-id', 'r1'], { encoding: 'utf8' })
  assert.match(out, /agent.run.start/)
})

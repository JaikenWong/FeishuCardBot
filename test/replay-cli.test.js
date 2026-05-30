const { test } = require('node:test')
const assert = require('node:assert')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

test('replay-cli 输出 aggregate 汇总', () => {
  const out = execFileSync('node', ['src/replay-cli.js'], { encoding: 'utf8' })
  assert.match(out, /\[replay\] aggregate total=\d+ card=\d+ timeout=\d+ svc_down=\d+ other=\d+ empty=\d+/)
})

test('replay-cli 单 fixture 非法时输出 FAIL 并退出非0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-cli-'))
  const fixture = path.join(dir, 'replay-bad.json')
  fs.writeFileSync(fixture, JSON.stringify({ turns: [{ user: 'u1', expect: { type: 'reply' } }] }), 'utf8')
  let failed = false
  try {
    execFileSync('node', ['src/replay-cli.js', fixture], { encoding: 'utf8' })
  } catch (e) {
    failed = true
    assert.strictEqual(e.status, 1)
    assert.match(String(e.stdout || ''), /\[replay\] FAIL replay-bad\.json/)
    assert.match(String(e.stdout || ''), /invalid replay fixture/)
  }
  assert.strictEqual(failed, true)
})

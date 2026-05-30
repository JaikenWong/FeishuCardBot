const { test } = require('node:test')
const assert = require('node:assert')
const { execFileSync } = require('node:child_process')

test('replay-cli 输出 aggregate 汇总', () => {
  const out = execFileSync('node', ['src/replay-cli.js'], { encoding: 'utf8' })
  assert.match(out, /\[replay\] aggregate total=\d+ card=\d+ timeout=\d+ svc_down=\d+ other=\d+ empty=\d+/)
})

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { checkReplayFixtures } = require('../src/replay-fixture-check')

test('checkReplayFixtures: 全部合法时通过', () => {
  const out = checkReplayFixtures()
  assert.strictEqual(out.ok, true)
  assert.ok(out.files.length > 0)
})

test('checkReplayFixtures: 坏 fixture 失败', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-fixtures-'))
  fs.writeFileSync(path.join(dir, 'replay-ok.json'), JSON.stringify({
    name: 'ok',
    turns: [{ user: 'u1', expect: { type: 'reply', contains: 'x' } }],
  }), 'utf8')
  fs.writeFileSync(path.join(dir, 'replay-bad.json'), JSON.stringify({
    name: '',
    turns: [{ user: 'u1', expect: { type: 'reply' } }],
  }), 'utf8')
  const out = checkReplayFixtures({ fixtureDir: dir })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('replay-bad.json')))
})

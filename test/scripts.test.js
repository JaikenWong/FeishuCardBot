const { test } = require('node:test')
const assert = require('node:assert')
const pkg = require('../package.json')

test('关键脚本存在', () => {
  const scripts = pkg.scripts || {}
  for (const k of ['doctor', 'harness:check', 'replay', 'test:harness', 'ci:check']) {
    assert.strictEqual(typeof scripts[k], 'string', `missing script: ${k}`)
  }
})

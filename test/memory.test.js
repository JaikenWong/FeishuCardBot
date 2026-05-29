const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadHistory, appendHistory, clearHistory } = require('../src/memory')

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mem-'))
}

test('loadHistory 不存在返回空数组', () => {
  assert.deepStrictEqual(loadHistory('u1', tmpDir()), [])
})

test('appendHistory 持久化并可读回', () => {
  const dir = tmpDir()
  appendHistory('u1', [{ role: 'user', content: 'hi' }], 20, dir)
  assert.deepStrictEqual(loadHistory('u1', dir), [{ role: 'user', content: 'hi' }])
})

test('appendHistory 超 maxHistory 截断为最近 N 条', () => {
  const dir = tmpDir()
  const msgs = Array.from({ length: 5 }, (_, i) => ({ role: 'user', content: String(i) }))
  appendHistory('u1', msgs, 3, dir)
  const h = loadHistory('u1', dir)
  assert.strictEqual(h.length, 3)
  assert.strictEqual(h[0].content, '2')
})

test('clearHistory 删除记忆', () => {
  const dir = tmpDir()
  appendHistory('u1', [{ role: 'user', content: 'hi' }], 20, dir)
  clearHistory('u1', dir)
  assert.deepStrictEqual(loadHistory('u1', dir), [])
})

test('loadHistory 遇到损坏 JSON 返回空数组', () => {
  const dir = tmpDir()
  fs.writeFileSync(path.join(dir, 'u1.json'), '{bad json', 'utf8')
  assert.deepStrictEqual(loadHistory('u1', dir), [])
})

test('appendHistory 自动过滤非法消息结构', () => {
  const dir = tmpDir()
  appendHistory('u1', [
    { role: 'user', content: 'ok' },
    { role: 'hacker', content: 'x' },
    { role: 'assistant', content: 123 },
  ], 20, dir)
  assert.deepStrictEqual(loadHistory('u1', dir), [{ role: 'user', content: 'ok' }])
})

test('appendHistory 原子写不遗留临时文件', () => {
  const dir = tmpDir()
  appendHistory('u1', [{ role: 'user', content: 'ok' }], 20, dir)
  const files = fs.readdirSync(dir)
  assert.ok(files.includes('u1.json'))
  assert.strictEqual(files.some((f) => f.includes('.tmp')), false)
})

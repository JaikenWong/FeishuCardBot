const { test } = require('node:test')
const assert = require('node:assert')
const { createPlmClient, normalizeOption, extractOptionArray } = require('../src/plm-client')

test('normalizeOption 兼容常见字段', () => {
  assert.deepStrictEqual(normalizeOption({ label: '项目A', id: 'p1' }), { text: '项目A', value: 'p1' })
  assert.deepStrictEqual(normalizeOption({ name: '项目B', value: 'p2' }), { text: '项目B', value: 'p2' })
})

test('extractOptionArray 兼容 payload 结构', () => {
  assert.deepStrictEqual(extractOptionArray([{ value: 'x' }]), [{ value: 'x' }])
  assert.deepStrictEqual(extractOptionArray({ options: [{ value: 'x' }] }), [{ value: 'x' }])
  assert.deepStrictEqual(extractOptionArray({ data: [{ value: 'x' }] }), [{ value: 'x' }])
  assert.deepStrictEqual(extractOptionArray({ nope: 1 }), [])
})

test('getProjectOptions 走映射端点并归一化', async () => {
  const calls = []
  const http = {
    get: async (url) => {
      calls.push(url)
      return { options: [{ label: 'PRJ-1', id: 'p1' }] }
    },
    post: async () => ({}),
  }
  const c = createPlmClient({ httpClient: http })
  const out = await c.getProjectOptions()
  assert.deepStrictEqual(calls, ['/options/projects'])
  assert.deepStrictEqual(out, [{ text: 'PRJ-1', value: 'p1' }])
})

test('选项接口失败返回空数组', async () => {
  const c = createPlmClient({
    httpClient: {
      get: async () => { throw new Error('down') },
      post: async () => ({}),
    },
  })
  assert.deepStrictEqual(await c.getLibraryOptions(), [])
})

test('createPart 成功映射返回结构', async () => {
  const c = createPlmClient({
    httpClient: {
      get: async () => [],
      post: async () => ({ part_number: 'P-001' }),
    },
  })
  const out = await c.createPart({
    materialName: '板', projectNumber: 'p1', library: 'lib', view: 'design', folder: 'f1', category: 'c1',
  })
  assert.strictEqual(out.success, true)
  assert.strictEqual(out.data.partNumber, 'P-001')
})

test('createPart 失败返回 success false', async () => {
  const c = createPlmClient({
    httpClient: {
      get: async () => [],
      post: async () => { throw new Error('bad request') },
    },
  })
  const out = await c.createPart({ materialName: '板', projectNumber: 'p1' })
  assert.strictEqual(out.success, false)
  assert.match(out.message, /bad request/)
})

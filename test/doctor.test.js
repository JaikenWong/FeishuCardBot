const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { checkEnv, runDoctor, runStrictChecks } = require('../src/doctor')

test('checkEnv 缺失变量识别', () => {
  const out = checkEnv({ FEISHU_APP_ID: 'x' })
  assert.strictEqual(out.ok, false)
  assert.ok(out.missing.includes('OPENAI_MODEL'))
})

test('runDoctor 全通过', () => {
  const schema = {
    submit: { action: 'submit_create_part' },
    fields: [{ name: 'material_name', type: 'input', required: true }],
  }
  const env = {
    FEISHU_APP_ID: 'x', FEISHU_APP_SECRET: 'x',
    OPENAI_BASE_URL: 'x', OPENAI_API_KEY: 'x', OPENAI_MODEL: 'x',
  }
  const agentConfig = {
    allowedTools: ['list_field_options', 'prepare_create_part'],
    maxSteps: 6,
    maxHistory: 20,
    openaiMaxRetries: 1,
    maxToolArgsSize: 4096,
    maxToolCallsPerStep: 5,
    callbackDedupeTtlMs: 300000,
    maxRequestsPerMinute: 20,
  }
  const out = runDoctor({ env, agentConfig, schema })
  assert.strictEqual(out.ok, true)
  assert.strictEqual(out.harnessCheck.ok, true)
})

test('runDoctor 缺 env 失败', () => {
  const schema = {
    submit: { action: 'submit_create_part' },
    fields: [{ name: 'material_name', type: 'input', required: true }],
  }
  const out = runDoctor({
    env: { FEISHU_APP_ID: 'x' },
    schema,
    agentConfig: { allowedTools: ['list_field_options', 'prepare_create_part'], maxSteps: 6, maxHistory: 20 },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.envCheck.missing.length > 0)
})

test('runDoctor skipEnv 时忽略 env 缺失', () => {
  const schema = {
    submit: { action: 'submit_create_part' },
    fields: [{ name: 'material_name', type: 'input', required: true }],
  }
  const out = runDoctor({
    env: {},
    skipEnv: true,
    schema,
    agentConfig: { allowedTools: ['list_field_options', 'prepare_create_part'], maxSteps: 6, maxHistory: 20 },
  })
  assert.strictEqual(out.envCheck.ok, true)
})

test('runDoctor 在 harness 规则违规时失败', () => {
  const schema = { submit: { action: 'submit_create_part' }, fields: [{ name: 'material_name', type: 'input', required: true }] }
  const out = runDoctor({
    env: { FEISHU_APP_ID: 'x', FEISHU_APP_SECRET: 'x', OPENAI_BASE_URL: 'x', OPENAI_API_KEY: 'x', OPENAI_MODEL: 'x' },
    schema,
    agentConfig: { allowedTools: ['not_exist_tool'], maxSteps: 6, maxHistory: 20 },
  })
  assert.strictEqual(out.ok, false)
  assert.strictEqual(out.harnessCheck.ok, false)
})

test('runDoctor 配置文件损坏时失败', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-'))
  const badCfg = path.join(dir, 'agent.json')
  fs.writeFileSync(badCfg, '{bad json', 'utf8')
  const out = runDoctor({
    skipEnv: true,
    schema: { submit: { action: 'submit_create_part' }, fields: [{ name: 'material_name', type: 'input', required: true }] },
    configPath: badCfg,
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.configError)
})

test('runStrictChecks: 重复字段与未知 endpoint 失败', () => {
  const out = runStrictChecks({
    schema: {
      fields: [
        { name: 'material_name', type: 'input', required: true },
        { name: 'material_name', type: 'select', optionSource: { type: 'plm', endpoint: 'bad_endpoint' } },
      ],
    },
    config: { model: '', systemPrompt: 'x' },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('字段名重复')))
  assert.ok(out.errors.some((e) => e.includes('未知 endpoint')))
})

test('runDoctor strict 开启时执行严格校验', () => {
  const schema = {
    submit: { action: 'submit_create_part' },
    fields: [
      { name: 'material_name', type: 'input', required: true },
      { name: 'material_name', type: 'select', required: true, optionSource: { type: 'plm', endpoint: 'bad' } },
    ],
  }
  const out = runDoctor({
    env: { FEISHU_APP_ID: 'x', FEISHU_APP_SECRET: 'x', OPENAI_BASE_URL: 'x', OPENAI_API_KEY: 'x', OPENAI_MODEL: 'x' },
    strict: true,
    schema,
    agentConfig: { allowedTools: ['list_field_options', 'prepare_create_part'], maxSteps: 6, maxHistory: 20, systemPrompt: 'ok', model: '' },
  })
  assert.strictEqual(out.ok, false)
  assert.strictEqual(out.strictCheck.ok, false)
})

test('runStrictChecks: submit 文案空或过长失败', () => {
  const baseConfig = { model: '', systemPrompt: 'ok' }
  const r1 = runStrictChecks({
    schema: { submit: { text: '   ' }, fields: [{ name: 'material_name', type: 'input', required: true }] },
    config: baseConfig,
  })
  assert.strictEqual(r1.ok, false)
  assert.ok(r1.errors.some((e) => e.includes('submit.text 不能为空')))

  const r2 = runStrictChecks({
    schema: { submit: { text: 'x'.repeat(31) }, fields: [{ name: 'material_name', type: 'input', required: true }] },
    config: baseConfig,
  })
  assert.strictEqual(r2.ok, false)
  assert.ok(r2.errors.some((e) => e.includes('长度不能超过 30')))
})

test('runStrictChecks: 字段 label/placeholder 质量失败', () => {
  const out = runStrictChecks({
    schema: {
      submit: { text: '确定创建' },
      fields: [
        { name: 'material_name', type: 'input', required: true, label: ' ', placeholder: '' },
        { name: 'project_number', type: 'input', required: true, label: 'x'.repeat(31), placeholder: 'y'.repeat(61) },
      ],
    },
    config: { model: '', systemPrompt: 'ok' },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('label 不能为空')))
  assert.ok(out.errors.some((e) => e.includes('label 长度不能超过 30')))
  assert.ok(out.errors.some((e) => e.includes('placeholder 不能为空')))
  assert.ok(out.errors.some((e) => e.includes('placeholder 长度不能超过 60')))
})

test('runStrictChecks: select 字段 placeholder 不能为空', () => {
  const out = runStrictChecks({
    schema: {
      submit: { text: '确定创建' },
      fields: [
        {
          name: 'project_number',
          type: 'select',
          required: true,
          label: '项目号',
          placeholder: ' ',
          optionSource: { type: 'static', options: [{ text: 'P1', value: 'p1' }] },
        },
      ],
    },
    config: { model: '', systemPrompt: 'ok' },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('placeholder 不能为空')))
})

test('runStrictChecks: static options value 重复失败', () => {
  const out = runStrictChecks({
    schema: {
      submit: { text: '确定创建' },
      fields: [
        {
          name: 'project_number',
          type: 'select',
          required: true,
          label: '项目号',
          placeholder: '请选择项目号',
          optionSource: {
            type: 'static',
            options: [
              { text: 'P1', value: 'p1' },
              { text: 'P1-dup', value: 'p1' },
            ],
          },
        },
      ],
    },
    config: { model: '', systemPrompt: 'ok' },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('options value 重复')))
})

test('runStrictChecks: static options text 非法失败', () => {
  const out = runStrictChecks({
    schema: {
      submit: { text: '确定创建' },
      fields: [
        {
          name: 'project_number',
          type: 'select',
          required: true,
          label: '项目号',
          placeholder: '请选择项目号',
          optionSource: {
            type: 'static',
            options: [
              { text: ' ', value: 'p1' },
              { text: 'x'.repeat(31), value: 'p2' },
            ],
          },
        },
      ],
    },
    config: { model: '', systemPrompt: 'ok' },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('options text 非法')))
})

test('runStrictChecks: static options value 非法失败', () => {
  const out = runStrictChecks({
    schema: {
      submit: { text: '确定创建' },
      fields: [
        {
          name: 'project_number',
          type: 'select',
          required: true,
          label: '项目号',
          placeholder: '请选择项目号',
          optionSource: {
            type: 'static',
            options: [
              { text: 'P1', value: ' ' },
              { text: 'P2', value: 'x'.repeat(61) },
            ],
          },
        },
      ],
    },
    config: { model: '', systemPrompt: 'ok' },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('options value 非法')))
})

test('runStrictChecks: 字段 name 规范失败', () => {
  const out = runStrictChecks({
    schema: {
      submit: { text: '确定创建' },
      fields: [
        { name: 'Bad-Name', type: 'input', required: true, label: '物料名', placeholder: '请输入物料名' },
        { name: 'x'.repeat(41), type: 'input', required: true, label: '项目号', placeholder: '请输入项目号' },
      ],
    },
    config: { model: '', systemPrompt: 'ok' },
  })
  assert.strictEqual(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes('name 格式非法')))
  assert.ok(out.errors.some((e) => e.includes('name 长度不能超过 40')))
})

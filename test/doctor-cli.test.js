const { test } = require('node:test')
const assert = require('node:assert')
const { execFileSync } = require('node:child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

test('doctor-cli 在缺 env 时退出非0', () => {
  let failed = false
  try {
    execFileSync('node', ['src/doctor-cli.js'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH || '' },
    })
  } catch (e) {
    failed = true
    assert.strictEqual(e.status, 1)
  }
  assert.strictEqual(failed, true)
})

test('doctor-cli 指定损坏 config 文件时退出非0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-cli-'))
  const badCfg = path.join(dir, 'bad.json')
  fs.writeFileSync(badCfg, '{bad json', 'utf8')
  let failed = false
  try {
    execFileSync('node', ['src/doctor-cli.js', '--skip-env', '--config', badCfg], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH || '' },
    })
  } catch (e) {
    failed = true
    assert.strictEqual(e.status, 1)
  }
  assert.strictEqual(failed, true)
})

test('doctor-cli strict 校验失败时退出非0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-cli-strict-'))
  const cfg = path.join(dir, 'agent.json')
  const schema = path.join(dir, 'schema.json')
  fs.writeFileSync(cfg, JSON.stringify({
    model: '',
    systemPrompt: 'ok',
    allowedTools: ['list_field_options', 'prepare_create_part'],
    maxSteps: 6,
    maxHistory: 20,
  }), 'utf8')
  fs.writeFileSync(schema, JSON.stringify({
    submit: { action: 'submit_create_part' },
    fields: [
      { name: 'material_name', type: 'input', required: true },
      { name: 'material_name', type: 'select', required: true, optionSource: { type: 'plm', endpoint: 'not_exists' } },
    ],
  }), 'utf8')

  let failed = false
  try {
    execFileSync('node', ['src/doctor-cli.js', '--skip-env', '--strict', '--config', cfg, '--schema', schema], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH || '' },
    })
  } catch (e) {
    failed = true
    assert.strictEqual(e.status, 1)
    assert.match(String(e.stdout || ''), /strict errors/)
  }
  assert.strictEqual(failed, true)
})

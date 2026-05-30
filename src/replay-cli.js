#!/usr/bin/env node
const path = require('path')
const fs = require('fs')
const { createAgent } = require('./agent')
const { loadReplayFixture, runReplay, assertReplay, summarizeReplayResults } = require('./replay')

function fakeOpenAIForReplay(queue) {
  let i = 0
  return {
    chat: {
      completions: {
        create: async () => {
          const item = queue[i++] || { choices: [{ message: { content: '' } }] }
          if (item && item.__throw) throw new Error(item.message || 'mock openai error')
          return item
        },
      },
    },
  }
}

function getFixturePaths(argv) {
  const fromArg = argv[2]
  if (fromArg && !fromArg.startsWith('--')) return [fromArg]
  const dir = path.join(__dirname, '..', 'test', 'fixtures')
  return fs.readdirSync(dir)
    .filter((x) => x.startsWith('replay-') && x.endsWith('.json'))
    .map((x) => path.join(dir, x))
}

function defaultResponses() {
  return [
    { choices: [{ message: { content: '仅支持仅 PLM / 物料领域问题。请描述要创建或查询的物料信息。' } }] },
    { choices: [{ message: { content: null, tool_calls: [{ id: 't1', function: { name: 'list_field_options', arguments: JSON.stringify({ field: 'project_number' }) } }] } }] },
    { choices: [{ message: { content: '项目号可选 P1' } }] },
    { choices: [{ message: { content: null, tool_calls: [{ id: 't2', function: { name: 'prepare_create_part', arguments: JSON.stringify({ values: { material_name: '板', project_number: 'p1' } }) } }] } }] },
  ]
}

async function runFixture(fixturePath) {
  const fixture = loadReplayFixture(fixturePath)
  const queue = Array.isArray(fixture.mockResponses) && fixture.mockResponses.length > 0
    ? fixture.mockResponses
    : defaultResponses()
  const agent = createAgent({
    openai: fakeOpenAIForReplay(queue),
    plmClient: { getProjectOptions: async () => [{ text: 'P1', value: 'p1' }] },
    config: {
      model: 'm',
      systemPrompt: 'sys',
      allowedTools: ['list_field_options', 'prepare_create_part'],
      maxSteps: fixture.maxSteps || 6,
      maxHistory: 20,
      openaiMaxRetries: fixture.openaiMaxRetries || 0,
      maxToolArgsSize: fixture.maxToolArgsSize || 4096,
    },
    schema: { fields: [{ name: 'material_name', required: true }, { name: 'project_number', required: true }] },
  })
  const results = await runReplay({ fixture, agent })
  return { fixture, check: assertReplay(results, fixture), summary: summarizeReplayResults(results) }
}

async function main() {
  const fixturePaths = getFixturePaths(process.argv)
  let hasFail = false
  const aggregate = { total: 0, cardAction: 0, timeout: 0, serviceUnavailable: 0, otherReply: 0, empty: 0 }
  for (const f of fixturePaths) {
    let fixture
    let check
    let summary
    try {
      ({ fixture, check, summary } = await runFixture(f))
    } catch (e) {
      hasFail = true
      console.log(`[replay] FAIL ${path.basename(f)}`)
      console.log(`- ${e.message || String(e)}`)
      continue
    }
    aggregate.total += summary.total
    aggregate.cardAction += summary.cardAction
    aggregate.timeout += summary.timeout
    aggregate.serviceUnavailable += summary.serviceUnavailable
    aggregate.otherReply += summary.otherReply
    aggregate.empty += summary.empty
    if (!check.ok) {
      hasFail = true
      console.log(`[replay] FAIL ${fixture.name || path.basename(f)}`)
      check.errors.forEach((e) => console.log(`- ${e}`))
      continue
    }
    console.log(`[replay] OK ${fixture.name || path.basename(f)}`)
    console.log(`[replay] summary total=${summary.total} card=${summary.cardAction} timeout=${summary.timeout} svc_down=${summary.serviceUnavailable} other=${summary.otherReply} empty=${summary.empty}`)
  }
  console.log(`[replay] aggregate total=${aggregate.total} card=${aggregate.cardAction} timeout=${aggregate.timeout} svc_down=${aggregate.serviceUnavailable} other=${aggregate.otherReply} empty=${aggregate.empty}`)
  if (hasFail) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

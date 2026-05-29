#!/usr/bin/env node
const { runHarnessCheck } = require('./harness-check')

const out = runHarnessCheck()
if (out.ok) {
  console.log('[harness-check] OK')
  process.exit(0)
}

console.log('[harness-check] FAIL')
for (const e of out.errors) console.log(`- ${e}`)
process.exit(1)

#!/usr/bin/env node
const { runDoctor } = require('./doctor')

function readArg(name) {
  const i = process.argv.indexOf(name)
  if (i === -1) return null
  return process.argv[i + 1] || null
}

function main() {
  const skipEnv = process.argv.includes('--skip-env')
  const strict = process.argv.includes('--strict')
  const schemaPath = readArg('--schema') || undefined
  const configPath = readArg('--config') || undefined
  const out = runDoctor({ skipEnv, strict, schemaPath, configPath })
  console.log(`[doctor] ${out.summary}`)
  if (!out.envCheck.ok) {
    console.log(`missing env: ${out.envCheck.missing.join(', ')}`)
  }
  if (out.schemaError) {
    console.log(`schema error: ${out.schemaError}`)
  }
  if (out.configError) {
    console.log(`config error: ${out.configError}`)
  }
  if (!out.cfgCheck.ok) {
    console.log(`config errors: ${out.cfgCheck.errors.join(' | ')}`)
  }
  if (!out.harnessCheck.ok) {
    console.log(`harness errors: ${out.harnessCheck.errors.join(' | ')}`)
  }
  if (!out.strictCheck.ok) {
    console.log(`strict errors: ${out.strictCheck.errors.join(' | ')}`)
  }
  process.exit(out.ok ? 0 : 1)
}

main()

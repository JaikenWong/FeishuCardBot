#!/usr/bin/env node
const { readAuditFile, getRequestTimeline } = require('./audit-query')
const { buildAuditReport } = require('./audit-report')

function parseArgs(argv) {
  const args = { cmd: 'summary', path: process.env.AUDIT_LOG_PATH || 'data/audit/audit.jsonl', limit: 10, requestId: '' }
  const rest = argv.slice(2)
  if (rest[0]) args.cmd = rest[0]
  for (let i = 1; i < rest.length; i++) {
    const a = rest[i]
    if (a === '--path') args.path = rest[++i]
    else if (a === '--limit') args.limit = Number(rest[++i] || 10)
    else if (a === '--request-id') args.requestId = rest[++i] || ''
  }
  return args
}

function main() {
  const args = parseArgs(process.argv)
  const rows = readAuditFile(args.path)

  if (args.cmd === 'summary') {
    const out = buildAuditReport(rows, { limit: args.limit }).map((x) => ({
      requestId: x.requestId,
      status: x.status,
      eventCount: x.eventCount,
      durationMs: x.durationMs,
      lastTs: x.lastTs,
    }))
    console.table(out)
    return
  }

  if (args.cmd === 'timeline') {
    if (!args.requestId) {
      console.error('missing --request-id')
      process.exit(1)
    }
    const tl = getRequestTimeline(rows, args.requestId)
    console.table(tl.map((x) => ({ ts: x.ts, event: x.event })))
    return
  }

  console.error('unknown cmd, use: summary|timeline')
  process.exit(1)
}

main()

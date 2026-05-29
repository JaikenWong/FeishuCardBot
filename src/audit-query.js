const fs = require('fs')

function parseAuditLines(text = '') {
  return String(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

function readAuditFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8')
    return parseAuditLines(text)
  } catch {
    return []
  }
}

function groupByRequestId(records = []) {
  const out = new Map()
  for (const r of records) {
    const reqId = r?.payload?.requestId
    if (!reqId) continue
    if (!out.has(reqId)) out.set(reqId, [])
    out.get(reqId).push(r)
  }
  return out
}

function getRequestTimeline(records = [], requestId) {
  return records.filter((r) => r?.payload?.requestId === requestId)
}

function checkRequestCompleteness(records = []) {
  const events = new Set(records.map((r) => r.event))
  return {
    hasHandlerStart: events.has('handler.message.agent_run'),
    hasAgentStart: events.has('agent.run.start'),
    hasAgentEnd: events.has('agent.run.end'),
    hasTimeout: events.has('agent.run.timeout'),
  }
}

module.exports = {
  parseAuditLines,
  readAuditFile,
  groupByRequestId,
  getRequestTimeline,
  checkRequestCompleteness,
}

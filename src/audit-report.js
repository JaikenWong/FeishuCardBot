const { groupByRequestId, checkRequestCompleteness } = require('./audit-query')

function inferStatus(records = []) {
  const c = checkRequestCompleteness(records)
  const events = new Set(records.map((r) => r.event))
  if (events.has('agent.run.error')) return 'error'
  if (c.hasTimeout) return 'timeout'
  if (c.hasHandlerStart && c.hasAgentStart && c.hasAgentEnd) return 'ok'
  return 'incomplete'
}

function calcDurationMs(firstTs, lastTs) {
  if (!firstTs || !lastTs) return null
  const start = Date.parse(firstTs)
  const end = Date.parse(lastTs)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return Math.max(0, end - start)
}

function pickRangeTs(records = []) {
  const valid = records
    .map((r) => r?.ts)
    .filter((ts) => Number.isFinite(Date.parse(ts)))
    .sort((a, b) => Date.parse(a) - Date.parse(b))
  if (valid.length === 0) {
    return {
      firstTs: records[0]?.ts || null,
      lastTs: records[records.length - 1]?.ts || null,
    }
  }
  return { firstTs: valid[0], lastTs: valid[valid.length - 1] }
}

function summarizeRequest(requestId, records = []) {
  const { firstTs, lastTs } = pickRangeTs(records)
  const events = records.map((r) => r.event)
  return {
    requestId,
    status: inferStatus(records),
    eventCount: records.length,
    firstTs,
    lastTs,
    durationMs: calcDurationMs(firstTs, lastTs),
    toolErrorCount: events.filter((e) => e === 'agent.tool.error').length,
    toolResultErrorCount: events.filter((e) => e === 'agent.tool.result_error').length,
    openaiErrorCount: events.filter((e) => e === 'agent.run.error').length,
    events,
  }
}

function buildAuditReport(records = [], { limit = 20 } = {}) {
  const grouped = groupByRequestId(records)
  const rows = []
  for (const [requestId, items] of grouped.entries()) {
    rows.push(summarizeRequest(requestId, items))
  }
  rows.sort((a, b) => {
    const byTs = String(b.lastTs).localeCompare(String(a.lastTs))
    if (byTs !== 0) return byTs
    return String(a.requestId).localeCompare(String(b.requestId))
  })
  return rows.slice(0, limit)
}

module.exports = {
  calcDurationMs,
  pickRangeTs,
  inferStatus,
  summarizeRequest,
  buildAuditReport,
}

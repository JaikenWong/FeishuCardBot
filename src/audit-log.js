const fs = require('fs')
const path = require('path')

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function createAuditLogger({ filePath, now = () => new Date().toISOString() }) {
  function redact(value, seen = new WeakSet()) {
    if (value == null) return value
    if (typeof value !== 'object') return value
    if (seen.has(value)) return '[Circular]'
    seen.add(value)

    if (Array.isArray(value)) return value.map((v) => redact(v, seen))

    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (/(token|secret|password|api[_-]?key)/i.test(k)) {
        out[k] = '[REDACTED]'
      } else {
        out[k] = redact(v, seen)
      }
    }
    return out
  }

  function normalizePayload(payload) {
    try {
      const safe = redact(payload)
      JSON.stringify(safe)
      return safe
    } catch {
      return { error: 'payload_not_serializable' }
    }
  }

  function log(event, payload = {}) {
    if (!filePath) return
    ensureParent(filePath)
    const line = JSON.stringify({ ts: now(), event, payload: normalizePayload(payload) }) + '\n'
    fs.appendFileSync(filePath, line, 'utf8')
  }

  function trace(event, payload = {}) {
    log(event, payload)
  }

  return { log, trace }
}

module.exports = { createAuditLogger }

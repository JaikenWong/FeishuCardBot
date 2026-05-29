/**
 * 会话记忆：按 open_id 存储多轮对话历史，本地 JSON 持久化。
 */
const fs = require('fs')
const path = require('path')

const DEFAULT_DIR = path.join(__dirname, '..', 'data', 'memory')
const ALLOWED_ROLES = new Set(['system', 'user', 'assistant', 'tool'])

function filePath(openId, baseDir) {
  const safeBase = path.resolve(baseDir)
  const p = path.resolve(path.join(baseDir, `${openId}.json`))
  if (!p.startsWith(safeBase + path.sep)) throw new Error('invalid openId')
  return p
}

function sanitizeHistory(items) {
  if (!Array.isArray(items)) return []
  return items
    .filter((m) => m && typeof m === 'object')
    .map((m) => ({ role: m.role, content: m.content }))
    .filter((m) => ALLOWED_ROLES.has(m.role) && typeof m.content === 'string')
}

function loadHistory(openId, baseDir = DEFAULT_DIR) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath(openId, baseDir), 'utf8'))
    return sanitizeHistory(parsed)
  } catch (e) {
    if (e.code === 'ENOENT' || e.name === 'SyntaxError') return []
    throw e
  }
}

function atomicWriteJson(targetPath, value) {
  const dir = path.dirname(targetPath)
  const tmp = path.join(
    dir,
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`
  )
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2))
  fs.renameSync(tmp, targetPath)
}

function appendHistory(openId, messages, maxHistory = 20, baseDir = DEFAULT_DIR) {
  const next = sanitizeHistory([...loadHistory(openId, baseDir), ...sanitizeHistory(messages)]).slice(-maxHistory)
  fs.mkdirSync(baseDir, { recursive: true })
  atomicWriteJson(filePath(openId, baseDir), next)
  return next
}

function clearHistory(openId, baseDir = DEFAULT_DIR) {
  try {
    fs.unlinkSync(filePath(openId, baseDir))
  } catch (e) {
    if (e.code === 'ENOENT') return
    throw e
  }
}

module.exports = { loadHistory, appendHistory, clearHistory, sanitizeHistory, atomicWriteJson }

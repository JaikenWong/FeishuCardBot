/**
 * 会话记忆：按 open_id 存储多轮对话历史，本地 JSON 持久化。
 */
const fs = require('fs')
const path = require('path')

const DEFAULT_DIR = path.join(__dirname, '..', 'data', 'memory')

function filePath(openId, baseDir) {
  const safeBase = path.resolve(baseDir)
  const p = path.resolve(path.join(baseDir, `${openId}.json`))
  if (!p.startsWith(safeBase + path.sep)) throw new Error('invalid openId')
  return p
}

function loadHistory(openId, baseDir = DEFAULT_DIR) {
  try {
    return JSON.parse(fs.readFileSync(filePath(openId, baseDir), 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT') return []
    throw e
  }
}

function appendHistory(openId, messages, maxHistory = 20, baseDir = DEFAULT_DIR) {
  const next = [...loadHistory(openId, baseDir), ...messages].slice(-maxHistory)
  fs.mkdirSync(baseDir, { recursive: true })
  fs.writeFileSync(filePath(openId, baseDir), JSON.stringify(next, null, 2))
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

module.exports = { loadHistory, appendHistory, clearHistory }
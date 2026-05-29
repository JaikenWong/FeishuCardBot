/**
 * 会话记忆：按 open_id 存储多轮对话历史，本地 JSON 持久化。
 */
const fs = require('fs')
const path = require('path')

const DEFAULT_DIR = path.join(__dirname, '..', 'data', 'memory')

function filePath(openId, baseDir) {
  return path.join(baseDir, `${openId}.json`)
}

function loadHistory(openId, baseDir = DEFAULT_DIR) {
  try {
    return JSON.parse(fs.readFileSync(filePath(openId, baseDir), 'utf8'))
  } catch {
    return []
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
  } catch {
    /* 不存在则忽略 */
  }
}

module.exports = { loadHistory, appendHistory, clearHistory }
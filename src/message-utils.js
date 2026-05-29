/**
 * 飞书事件解析工具，隔离 SDK 事件结构差异，便于单测。
 */

function pickEventData(payload = {}) {
  return payload?.event || payload || {}
}

function extractOpenId(payload = {}) {
  const e = pickEventData(payload)
  return e?.sender?.sender_id?.open_id || e?.operator?.open_id || payload?.open_id || ''
}

function extractChatId(payload = {}) {
  const e = pickEventData(payload)
  return e?.message?.chat_id || e?.chat_id || ''
}

function extractMessageText(payload = {}) {
  const e = pickEventData(payload)
  const raw = e?.message?.content || e?.content || ''
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed?.text === 'string' ? parsed.text.trim() : ''
  } catch {
    return ''
  }
}

function extractSubmitFormValue(payload = {}) {
  const e = pickEventData(payload)
  const action = e?.action || payload?.action || {}
  return action?.form_value || e?.form_value || payload?.form_value || {}
}

module.exports = {
  pickEventData,
  extractOpenId,
  extractChatId,
  extractMessageText,
  extractSubmitFormValue,
}

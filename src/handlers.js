const { extractOpenId, extractChatId, extractMessageText, extractSubmitFormValue } = require('./message-utils')
const { shouldRejectTopic, defaultRejectReply } = require('./topic-guard')
const { parseSubmitForm } = require('./submit-parser')
const { createTracer } = require('./tracing')
const { createKeyedQueue } = require('./keyed-queue')
const { createDedupeStore, buildCallbackDedupeKey } = require('./dedupe')
const { validateAgentOutput } = require('./output-contract')
const { createRateLimiter } = require('./rate-limit')

function createRequestId(prefix = 'req') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function createHandlers({
  agent,
  client,
  buildCreatePartCard,
  buildResultCard,
  createPart,
  appendHistory,
  maxHistory,
  topicBoundary,
  schema,
  trace,
  requestIdFactory = createRequestId,
  callbackDedupeTtlMs = 5 * 60 * 1000,
  maxRequestsPerMinute = 20,
  logger = console,
}) {
  const tracer = createTracer(trace)
  const msgQueue = createKeyedQueue()
  const callbackDedupe = createDedupeStore({ ttlMs: callbackDedupeTtlMs })
  const rateLimiter = createRateLimiter({ limit: maxRequestsPerMinute, windowMs: 60 * 1000 })
  async function sendResultCard(openId, result) {
    const card = buildResultCard(result)
    const res = await client.im.message.create({
      params: { receive_id_type: 'open_id' },
      data: { receive_id: openId, msg_type: 'interactive', content: JSON.stringify(card) },
    })
    logger.log('📤 结果卡片发送成功:', res?.data?.message_id)
  }

  async function handleMessage(data) {
    try {
      const openId = extractOpenId(data)
      const chatId = extractChatId(data)
      const text = extractMessageText(data)
      const requestId = requestIdFactory('msg')
      if (!openId || !text || !chatId) return
      const rl = rateLimiter.allow(openId)
      if (!rl.allowed) {
        tracer.emit('handler.message.rate_limited', { openId, chatId, requestId })
        await client.im.message.create({
          params: { receive_id_type: 'chat_id' },
          data: { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text: '请求过于频繁，请稍后再试' }) },
        })
        return
      }
      await msgQueue.run(openId, async () => {
        tracer.emit('handler.message.queued', { openId, chatId, requestId })
        if (shouldRejectTopic(text)) {
          tracer.emit('handler.message.rejected', { openId, chatId, requestId })
          await client.im.message.create({
            params: { receive_id_type: 'chat_id' },
            data: { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text: defaultRejectReply(topicBoundary) }) },
          })
          return
        }

        logger.log(`👤 用户消息: openId=${openId}, chatId=${chatId}, text="${text}"`)
        tracer.emit('handler.message.agent_run', { openId, chatId, requestId })

        const out = await agent.run(openId, text, { requestId })
        const check = validateAgentOutput(out)
        if (!check.ok) {
          tracer.emit('handler.message.invalid_agent_output', { openId, chatId, requestId, reason: check.reason })
          await client.im.message.create({
            params: { receive_id_type: 'chat_id' },
            data: { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text: '服务繁忙，请稍后重试' }) },
          })
          return
        }
        if (out.cardAction?.type === 'confirm_create') {
          tracer.emit('handler.message.confirm_card', { openId, chatId, requestId })
          const card = await buildCreatePartCard(out.cardAction.values)
          await client.im.message.create({
            params: { receive_id_type: 'chat_id' },
            data: { receive_id: chatId, msg_type: 'interactive', content: JSON.stringify(card) },
          })
          logger.log('📤 确认卡片发送成功')
        } else {
          tracer.emit('handler.message.reply', { openId, chatId, requestId })
          await client.im.message.create({
            params: { receive_id_type: 'chat_id' },
            data: { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text: out.reply }) },
          })
        }
      })
    } catch (err) {
      logger.error('❌ 处理消息失败:', err)
    }
  }

  async function handleCardCallback(data) {
    try {
      logger.log('🔍 回调完整数据:', JSON.stringify(data, null, 2))

      const action = data?.action || data?.event?.action || {}
      const openId = extractOpenId(data)
      const requestId = requestIdFactory('cb')
      const isSubmit = action?.action_type === 'form_submit' || action?.name === 'submit_btn' || action?.value?.action === 'submit_create_part'
      if (!isSubmit || !openId) {
        tracer.emit('handler.callback.ignored', { openId: openId || null, requestId })
        logger.log('⏭ 非提交按钮，忽略')
        return
      }

      const formValue = extractSubmitFormValue(data)
      const dedupeKey = buildCallbackDedupeKey({ openId, formValue })
      const dedupe = callbackDedupe.checkAndMark(dedupeKey)
      if (dedupe.duplicate) {
        tracer.emit('handler.callback.duplicate', { openId, requestId })
        logger.log('⏭ 重复提交，忽略')
        return
      }
      const parsed = parseSubmitForm(formValue, schema)
      if (!parsed.ok) {
        tracer.emit('handler.callback.invalid_form', { openId, missing: parsed.missing, requestId })
        const fail = { success: false, message: `缺少必填字段: ${parsed.missing.join(', ')}` }
        await sendResultCard(openId, fail)
        appendHistory(openId, [{ role: 'assistant', content: fail.message }], maxHistory)
        return
      }

      const formData = parsed.partData
      logger.log('📝 表单数据:', JSON.stringify(formData, null, 2))
      tracer.emit('handler.callback.create_part', { openId, requestId })

      const result = await createPart(formData)
      tracer.emit('handler.callback.create_result', { openId, success: Boolean(result.success), requestId })
      await sendResultCard(openId, result)

      const text = result.success ? `已创建物料：${formData.materialName}` : `物料创建失败：${result.message}`
      appendHistory(openId, [{ role: 'assistant', content: text }], maxHistory)
    } catch (err) {
      logger.error('❌ 处理卡片回调失败:', err)
    }
  }

  return { handleMessage, handleCardCallback, sendResultCard }
}

module.exports = { createHandlers, createRequestId }

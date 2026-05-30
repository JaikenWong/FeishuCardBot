/**
 * Agent 循环：OpenAI 协议 tool calling。
 * 边界：白名单 tool（tools.js）、maxSteps 限调用次数、创建走卡片确认。
 */
const memory = require('./memory')
const tools = require('./tools')
const { createTracer } = require('./tracing')
const { validateAgentOutput } = require('./output-contract')

function buildSystemPrompt(config, schema) {
  const lines = schema.fields
    .map((f) => `- ${f.name}（${f.label || f.name}，${f.required ? '必填' : '可选'}）`)
    .join('\n')
  return `${config.systemPrompt}\n\n创建物料需收集以下字段:\n${lines}\n\n字段齐全后调用 prepare_create_part 弹出确认卡片，绝不声称已直接创建。`
}

function createAgent({ openai, plmClient, config, schema, memoryDir, memoryMod = memory, toolsMod = tools, trace }) {
  const tracer = createTracer(trace)
  const openaiMaxRetries = Number.isInteger(config.openaiMaxRetries) ? config.openaiMaxRetries : 0
  const maxToolArgsSize = Number.isInteger(config.maxToolArgsSize) ? config.maxToolArgsSize : 4096
  const maxToolCallsPerStep = Number.isInteger(config.maxToolCallsPerStep) ? config.maxToolCallsPerStep : 5

  async function callOpenAI(messages, toolDefs, requestId) {
    let attempt = 0
    while (attempt <= openaiMaxRetries) {
      try {
        if (attempt > 0) tracer.emit('agent.openai.retry', { attempt, requestId })
        return await openai.chat.completions.create({ model: config.model, messages, tools: toolDefs })
      } catch (err) {
        if (attempt >= openaiMaxRetries) throw err
        attempt += 1
      }
    }
    throw new Error('openai retry exhausted')
  }

  async function run(openId, userText, meta = {}) {
    const requestId = meta.requestId || null
    tracer.emit('agent.run.start', { openId, requestId })
    const history = memoryMod.loadHistory(openId, memoryDir)
    const messages = [
      { role: 'system', content: buildSystemPrompt(config, schema) },
      ...history,
      { role: 'user', content: userText },
    ]
    const toolDefs = toolsMod.getToolDefinitions(config.allowedTools)

    let finalReply = null
    let cardAction = null

    for (let step = 0; step < config.maxSteps; step++) {
      tracer.emit('agent.step.start', { step, requestId })
      let resp
      try {
        resp = await callOpenAI(messages, toolDefs, requestId)
      } catch {
        tracer.emit('agent.run.error', { phase: 'openai', requestId })
        return { reply: '服务暂不可用，请稍后再试' }
      }
      const msg = resp.choices[0].message
      messages.push(msg)

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        finalReply = msg.content || ''
        tracer.emit('agent.step.final_reply', { step, hasReply: Boolean(finalReply), requestId })
        break
      }

      const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : []
      if (toolCalls.length > maxToolCallsPerStep) {
        tracer.emit('agent.tool_calls.truncated', {
          step,
          originalCount: toolCalls.length,
          allowedCount: maxToolCallsPerStep,
          requestId,
        })
      }
      let stop = false
      for (const tc of toolCalls.slice(0, maxToolCallsPerStep)) {
        tracer.emit('agent.tool.start', { step, name: tc.function.name, requestId })
        let args = {}
        const rawArgs = tc.function.arguments || '{}'
        let out
        if (String(rawArgs).length > maxToolArgsSize) {
          const errMsg = `tool arguments too large: ${String(rawArgs).length}`
          tracer.emit('agent.tool.args_too_large', { step, name: tc.function.name, toolArgsSize: String(rawArgs).length, limit: maxToolArgsSize, requestId })
          tracer.emit('agent.tool.error', { step, name: tc.function.name, error: errMsg, toolArgsSize: String(rawArgs).length, requestId })
          out = { result: { error: errMsg } }
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out.result) })
          continue
        }
        try { args = JSON.parse(rawArgs) } catch { /* 容错空参 */ }
        try {
          out = await toolsMod.executeTool(tc.function.name, args, { schema, client: plmClient })
        } catch (e) {
          tracer.emit('agent.tool.error', {
            step,
            name: tc.function.name,
            error: e.message,
            toolArgsSize: String(rawArgs).length,
            requestId,
          })
          out = { result: { error: e.message } }
        }
        if (out.cardAction) {
          cardAction = out.cardAction
          stop = true
          tracer.emit('agent.tool.card_action', { step, name: tc.function.name, actionType: out.cardAction.type, requestId })
          messages.push({ role: 'tool', tool_call_id: tc.id, content: '已弹出确认卡片' })
          break
        } else {
          tracer.emit('agent.tool.result', { step, name: tc.function.name, requestId })
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out.result) })
        }
      }
      if (stop) break
    }

    if (!finalReply && !cardAction) {
      finalReply = '处理超时，请简化你的请求后重试'
      tracer.emit('agent.run.timeout', { requestId })
    }

    const toPersist = [{ role: 'user', content: userText }]
    if (finalReply) toPersist.push({ role: 'assistant', content: finalReply })
    memoryMod.appendHistory(openId, toPersist, config.maxHistory, memoryDir)
    let out = cardAction ? { cardAction } : { reply: finalReply }
    const outCheck = validateAgentOutput(out)
    if (!outCheck.ok) {
      tracer.emit('agent.output.invalid', { reason: outCheck.reason, requestId })
      out = { reply: '服务暂不可用，请稍后再试' }
    }

    tracer.emit('agent.run.end', { hasCardAction: Boolean(out.cardAction), hasReply: Boolean(out.reply), requestId })
    return out
  }

  return { run }
}

module.exports = { createAgent, buildSystemPrompt }

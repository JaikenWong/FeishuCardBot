/**
 * Agent 循环：OpenAI 协议 tool calling。
 * 边界：白名单 tool（tools.js）、maxSteps 限调用次数、创建走卡片确认。
 */
const memory = require('./memory')
const tools = require('./tools')

function buildSystemPrompt(config, schema) {
  const lines = schema.fields
    .map((f) => `- ${f.name}（${f.label || f.name}，${f.required ? '必填' : '可选'}）`)
    .join('\n')
  return `${config.systemPrompt}\n\n创建物料需收集以下字段:\n${lines}\n\n字段齐全后调用 prepare_create_part 弹出确认卡片，绝不声称已直接创建。`
}

function createAgent({ openai, plmClient, config, schema, memoryDir, memoryMod = memory, toolsMod = tools }) {
  async function run(openId, userText) {
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
      let resp
      try {
        resp = await openai.chat.completions.create({ model: config.model, messages, tools: toolDefs })
      } catch {
        return { reply: '服务暂不可用，请稍后再试' }
      }
      const msg = resp.choices[0].message
      messages.push(msg)

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        finalReply = msg.content || ''
        break
      }

      let stop = false
      for (const tc of msg.tool_calls) {
        let args = {}
        try { args = JSON.parse(tc.function.arguments || '{}') } catch { /* 容错空参 */ }
        let out
        try {
          out = await toolsMod.executeTool(tc.function.name, args, { schema, client: plmClient })
        } catch (e) {
          out = { result: { error: e.message } }
        }
        if (out.cardAction) {
          cardAction = out.cardAction
          stop = true
          messages.push({ role: 'tool', tool_call_id: tc.id, content: '已弹出确认卡片' })
        } else {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out.result) })
        }
      }
      if (stop) break
    }

    if (!finalReply && !cardAction) {
      finalReply = '处理超时，请简化你的请求后重试'
    }

    const toPersist = [{ role: 'user', content: userText }]
    if (finalReply) toPersist.push({ role: 'assistant', content: finalReply })
    memoryMod.appendHistory(openId, toPersist, config.maxHistory, memoryDir)

    return cardAction ? { cardAction } : { reply: finalReply }
  }

  return { run }
}

module.exports = { createAgent, buildSystemPrompt }
const fs = require('fs')

function validateReplayFixture(fixture, filePath = '') {
  const where = filePath ? ` in ${filePath}` : ''
  if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) {
    throw new Error(`invalid replay fixture${where}: root must be object`)
  }
  if (typeof fixture.name !== 'string' || fixture.name.trim() === '') {
    throw new Error(`invalid replay fixture${where}: name must be non-empty string`)
  }
  if (!Array.isArray(fixture.turns) || fixture.turns.length === 0) {
    throw new Error(`invalid replay fixture${where}: turns must be non-empty array`)
  }
  fixture.turns.forEach((turn, idx) => {
    if (!turn || typeof turn !== 'object' || Array.isArray(turn)) {
      throw new Error(`invalid replay fixture${where}: turns[${idx}] must be object`)
    }
    if (typeof turn.user !== 'string' || turn.user.trim() === '') {
      throw new Error(`invalid replay fixture${where}: turns[${idx}].user must be non-empty string`)
    }
    if (!turn.expect || typeof turn.expect !== 'object' || Array.isArray(turn.expect)) {
      throw new Error(`invalid replay fixture${where}: turns[${idx}].expect must be object`)
    }
  })
}

function loadReplayFixture(filePath) {
  const fixture = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  validateReplayFixture(fixture, filePath)
  return fixture
}

async function runReplay({ fixture, agent, openId = 'replay_user' }) {
  const results = []
  for (const turn of fixture.turns || []) {
    const out = await agent.run(openId, turn.user)
    results.push({ user: turn.user, out })
  }
  return results
}

function assertReplay(results, fixture) {
  const errors = []
  for (let i = 0; i < (fixture.turns || []).length; i++) {
    const exp = fixture.turns[i].expect || {}
    const out = results[i]?.out || {}
    if (exp.type === 'reply') {
      if (typeof out.reply !== 'string') errors.push(`turn ${i}: expect reply`)
      if (exp.contains && !out.reply?.includes(exp.contains)) errors.push(`turn ${i}: reply missing ${exp.contains}`)
    }
    if (exp.type === 'cardAction') {
      if (!out.cardAction) errors.push(`turn ${i}: expect cardAction`)
      if (exp.actionType && out.cardAction?.type !== exp.actionType) errors.push(`turn ${i}: actionType mismatch`)
    }
    if (exp.notCardAction) {
      if (out.cardAction) errors.push(`turn ${i}: expect no cardAction`)
    }
  }
  return { ok: errors.length === 0, errors }
}

function summarizeReplayResults(results = []) {
  const summary = {
    total: results.length,
    cardAction: 0,
    timeout: 0,
    serviceUnavailable: 0,
    otherReply: 0,
    empty: 0,
  }
  for (const row of results) {
    const out = row?.out || {}
    if (out.cardAction) {
      summary.cardAction += 1
      continue
    }
    if (typeof out.reply === 'string') {
      if (out.reply.includes('处理超时')) summary.timeout += 1
      else if (out.reply.includes('服务暂不可用')) summary.serviceUnavailable += 1
      else summary.otherReply += 1
      continue
    }
    summary.empty += 1
  }
  return summary
}

module.exports = { loadReplayFixture, runReplay, assertReplay, summarizeReplayResults, validateReplayFixture }

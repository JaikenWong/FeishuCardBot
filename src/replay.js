const fs = require('fs')

function validateReplayFixture(fixture, filePath = '') {
  const where = filePath ? ` in ${filePath}` : ''
  const allowedTopKeys = new Set(['name', 'turns', 'mockResponses', 'maxSteps', 'openaiMaxRetries', 'maxToolArgsSize'])
  const allowedExpectKeys = new Set(['type', 'contains', 'actionType', 'notCardAction'])
  const assertIntInRange = (key, min, max) => {
    if (fixture[key] == null) return
    if (!Number.isInteger(fixture[key]) || fixture[key] < min || fixture[key] > max) {
      throw new Error(`invalid replay fixture${where}: ${key} must be integer in ${min}-${max}`)
    }
  }
  if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) {
    throw new Error(`invalid replay fixture${where}: root must be object`)
  }
  const unknownTopKeys = Object.keys(fixture).filter((k) => !allowedTopKeys.has(k))
  if (unknownTopKeys.length > 0) {
    throw new Error(`invalid replay fixture${where}: unknown top-level keys: ${unknownTopKeys.join(',')}`)
  }
  if (typeof fixture.name !== 'string' || fixture.name.trim() === '') {
    throw new Error(`invalid replay fixture${where}: name must be non-empty string`)
  }
  if (!/^[a-z0-9][a-z0-9-]*-flow$/.test(fixture.name.trim())) {
    throw new Error(`invalid replay fixture${where}: name must match *-flow`)
  }
  if (!Array.isArray(fixture.turns) || fixture.turns.length === 0) {
    throw new Error(`invalid replay fixture${where}: turns must be non-empty array`)
  }
  assertIntInRange('maxSteps', 1, 12)
  assertIntInRange('openaiMaxRetries', 0, 5)
  assertIntInRange('maxToolArgsSize', 1, 32768)
  if (fixture.mockResponses != null) {
    if (!Array.isArray(fixture.mockResponses) || fixture.mockResponses.length === 0) {
      throw new Error(`invalid replay fixture${where}: mockResponses must be non-empty array when provided`)
    }
    fixture.mockResponses.forEach((item, idx) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`invalid replay fixture${where}: mockResponses[${idx}] must be object`)
      }
      if (item.__throw === true) {
        if (typeof item.message !== 'string' || item.message.trim() === '') {
          throw new Error(`invalid replay fixture${where}: mockResponses[${idx}].message must be non-empty string when __throw=true`)
        }
      }
    })
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
    const expect = turn.expect
    if (expect.type !== 'reply' && expect.type !== 'cardAction') {
      throw new Error(`invalid replay fixture${where}: turns[${idx}].expect.type must be reply|cardAction`)
    }
    const unknownKeys = Object.keys(expect).filter((k) => !allowedExpectKeys.has(k))
    if (unknownKeys.length > 0) {
      throw new Error(`invalid replay fixture${where}: turns[${idx}].expect has unknown keys: ${unknownKeys.join(',')}`)
    }
    if (Object.prototype.hasOwnProperty.call(expect, 'contains')) {
      if (typeof expect.contains !== 'string' || expect.contains.trim() === '') {
        throw new Error(`invalid replay fixture${where}: turns[${idx}].expect.contains must be non-empty string`)
      }
    }
    if (Object.prototype.hasOwnProperty.call(expect, 'actionType')) {
      if (typeof expect.actionType !== 'string' || expect.actionType.trim() === '') {
        throw new Error(`invalid replay fixture${where}: turns[${idx}].expect.actionType must be non-empty string`)
      }
    }
    if (Object.prototype.hasOwnProperty.call(expect, 'notCardAction') && expect.notCardAction !== true) {
      throw new Error(`invalid replay fixture${where}: turns[${idx}].expect.notCardAction must be true when provided`)
    }
    if (expect.type === 'reply' && Object.prototype.hasOwnProperty.call(expect, 'actionType')) {
      throw new Error(`invalid replay fixture${where}: turns[${idx}].expect.actionType only allowed for cardAction`)
    }
    if (expect.type === 'reply' && !Object.prototype.hasOwnProperty.call(expect, 'contains')) {
      throw new Error(`invalid replay fixture${where}: turns[${idx}].expect.contains required for reply assertions`)
    }
    if (expect.type === 'cardAction' && !Object.prototype.hasOwnProperty.call(expect, 'actionType')) {
      throw new Error(`invalid replay fixture${where}: turns[${idx}].expect.actionType required for cardAction assertions`)
    }
    if (expect.type === 'cardAction' && Object.prototype.hasOwnProperty.call(expect, 'contains')) {
      throw new Error(`invalid replay fixture${where}: turns[${idx}].expect.contains only allowed for reply`)
    }
    if (expect.type === 'cardAction' && Object.prototype.hasOwnProperty.call(expect, 'notCardAction')) {
      throw new Error(`invalid replay fixture${where}: turns[${idx}].expect.notCardAction only allowed for reply`)
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

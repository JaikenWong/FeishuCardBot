const fs = require('fs')

function loadReplayFixture(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
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

module.exports = { loadReplayFixture, runReplay, assertReplay }

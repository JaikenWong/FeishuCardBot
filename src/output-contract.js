function validateAgentOutput(out) {
  const hasReply = typeof out?.reply === 'string'
  const hasCard = Boolean(out?.cardAction)

  if (hasReply && hasCard) return { ok: false, reason: 'both_reply_and_card' }
  if (!hasReply && !hasCard) return { ok: false, reason: 'missing_reply_and_card' }
  if (hasCard && typeof out.cardAction?.type !== 'string') return { ok: false, reason: 'invalid_card_action' }
  if (hasCard && out.cardAction?.type !== 'confirm_create') return { ok: false, reason: 'unsupported_card_action' }
  return { ok: true }
}

module.exports = { validateAgentOutput }

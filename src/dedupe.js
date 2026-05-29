function createDedupeStore({ ttlMs = 5 * 60 * 1000, now = () => Date.now() } = {}) {
  const seen = new Map()

  function cleanup() {
    const t = now()
    for (const [k, exp] of seen.entries()) {
      if (exp <= t) seen.delete(k)
    }
  }

  function checkAndMark(key) {
    cleanup()
    const t = now()
    const exp = seen.get(key)
    if (exp && exp > t) return { duplicate: true }
    seen.set(key, t + ttlMs)
    return { duplicate: false }
  }

  function size() {
    cleanup()
    return seen.size
  }

  return { checkAndMark, size }
}

function buildCallbackDedupeKey({ openId, formValue }) {
  const pairs = Object.entries(formValue || {}).sort((a, b) => a[0].localeCompare(b[0]))
  return `${openId}|${JSON.stringify(pairs)}`
}

module.exports = { createDedupeStore, buildCallbackDedupeKey }

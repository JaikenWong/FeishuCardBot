function createRateLimiter({ limit = 20, windowMs = 60 * 1000, now = () => Date.now() } = {}) {
  const buckets = new Map()

  function allow(key) {
    const t = now()
    const arr = buckets.get(key) || []
    const next = arr.filter((ts) => t - ts < windowMs)
    if (next.length >= limit) {
      buckets.set(key, next)
      return { allowed: false, remaining: 0 }
    }
    next.push(t)
    buckets.set(key, next)
    return { allowed: true, remaining: Math.max(0, limit - next.length) }
  }

  return { allow }
}

module.exports = { createRateLimiter }

function createKeyedQueue() {
  const tails = new Map()

  function run(key, task) {
    const prev = tails.get(key) || Promise.resolve()
    const next = prev.catch(() => {}).then(() => task())
    const cleanup = next.finally(() => {
      if (tails.get(key) === cleanup) tails.delete(key)
    })
    tails.set(key, cleanup)
    return next
  }

  function size() {
    return tails.size
  }

  return { run, size }
}

module.exports = { createKeyedQueue }

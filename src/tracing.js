function noop() {}

function createTracer(trace) {
  const fn = typeof trace === 'function' ? trace : noop
  return {
    emit(event, payload = {}) {
      try { fn(event, payload) } catch { /* tracing must not break runtime */ }
    },
  }
}

module.exports = { createTracer }

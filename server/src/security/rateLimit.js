// A simple limiter kept in memory: "at most `max` tries per `windowMs` for each key".
// (For many servers you would use a shared store; for this prototype memory is enough.)
function createLimiter({ max, windowMs, now = () => Date.now() }) {
  const hits = new Map();
  return {
    // returns { allowed, retryAfterSeconds }
    check(key) {
      const t = now();
      const recent = (hits.get(key) || []).filter((x) => t - x < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return { allowed: false, retryAfterSeconds: Math.ceil((windowMs - (t - recent[0])) / 1000) };
      }
      recent.push(t);
      hits.set(key, recent);
      return { allowed: true, retryAfterSeconds: 0 };
    },
    reset(key) { hits.delete(key); },
  };
}

module.exports = { createLimiter };

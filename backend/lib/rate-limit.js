'use strict';

/**
 * Fixed-window attempt counter kept in memory. Good enough for a single server process;
 * use a shared store (for example Redis) if you run several.
 */
function createLimiter({ windowMs, max, maxKeys = 50000 }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs);
  if (timer.unref) timer.unref();

  return {
    /** Counts one attempt for the key. Returns { ok: true } or { ok: false, retryAfterSeconds }. */
    take(key, now = Date.now()) {
      if (hits.size > maxKeys) hits.clear();
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      return entry.count <= max ? { ok: true } : { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
    },
    reset(key) {
      hits.delete(key);
    }
  };
}

module.exports = { createLimiter };

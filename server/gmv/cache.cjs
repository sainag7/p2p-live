/**
 * In-memory TTL cache with in-flight sharing, negative caching and stale-on-error.
 * Nothing is persisted: GMV data must not be stored for more than 24 hours.
 */

function createTtlCache({ now = Date.now } = {}) {
  const entries = new Map(); // key → { value, fetchedAt }
  const failures = new Map(); // key → { at, error }
  const inFlight = new Map(); // key → Promise<{ value, stale, fetchedAt }>
  let hits = 0;

  function staleOrThrow(key, ttlMs, staleMs, error) {
    const last = entries.get(key);
    if (last && now() - last.fetchedAt < ttlMs + staleMs) {
      return { value: last.value, stale: true, fetchedAt: last.fetchedAt };
    }
    throw error;
  }

  async function getOrFetch(key, ttlMs, fetchFn, { staleMs = 0, errorTtlMs = ttlMs } = {}) {
    const entry = entries.get(key);
    if (entry && now() - entry.fetchedAt < ttlMs) {
      hits += 1;
      return { value: entry.value, stale: false, fetchedAt: entry.fetchedAt };
    }

    const failure = failures.get(key);
    if (failure && now() - failure.at < errorTtlMs) {
      return staleOrThrow(key, ttlMs, staleMs, failure.error);
    }

    let promise = inFlight.get(key);
    if (!promise) {
      promise = (async () => {
        try {
          const value = await fetchFn();
          const fetchedAt = now();
          entries.set(key, { value, fetchedAt });
          failures.delete(key);
          return { value, stale: false, fetchedAt };
        } catch (error) {
          failures.set(key, { at: now(), error });
          throw error;
        } finally {
          inFlight.delete(key);
        }
      })();
      inFlight.set(key, promise);
    }

    try {
      return await promise;
    } catch (error) {
      return staleOrThrow(key, ttlMs, staleMs, error);
    }
  }

  function peek(key) {
    const entry = entries.get(key);
    return entry ? { value: entry.value, fetchedAt: entry.fetchedAt } : null;
  }

  return { getOrFetch, peek, stats: () => ({ entries: entries.size, hits }) };
}

module.exports = { createTtlCache };

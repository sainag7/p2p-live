/**
 * Minimal GMV Syncromatics RTPI client. The API key is sent only in the Api-Key header
 * and never appears in errors, logs, or return values.
 * Node's fetch already sends Accept-Encoding: gzip, deflate, br and decompresses responses.
 */

const { GMV_BASE_URL, REQUEST_TIMEOUT_MS } = require('./config.cjs');

class GmvError extends Error {
  constructor(message, { status = null, code = 'GMV_ERROR' } = {}) {
    super(message);
    this.name = 'GmvError';
    this.status = status;
    this.code = code;
  }
}

function createGmvClient({
  apiKey,
  baseUrl = GMV_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
  now = Date.now,
  onTiming = timing => { if (timing.durationMs >= 1000) console.warn('Slow GMV request', timing); },
} = {}) {
  const stats = { callCount: 0, lastSuccessAt: null, lastErrorAt: null, lastError: null };
  const timings = new Map();

  function recordError(message) {
    stats.lastErrorAt = now();
    stats.lastError = message;
  }

  async function get(path) {
    if (!apiKey) {
      const err = new GmvError('GMV_RTPI_API_KEY is not set', { code: 'MISSING_KEY' });
      recordError(err.message);
      throw err;
    }
    stats.callCount += 1;
    const startedAt = now();
    let outcome = 'ok';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${baseUrl}${path}`, {
        headers: { 'Api-Key': apiKey, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) throw new GmvError(`GMV ${res.status} for ${path}`, { status: res.status });
      const body = await res.json();
      stats.lastSuccessAt = now();
      return body;
    } catch (err) {
      outcome = err instanceof GmvError ? String(err.status || err.code) : err?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
      if (err instanceof GmvError) {
        recordError(err.message);
        throw err;
      }
      const isTimeout = err && err.name === 'AbortError';
      const wrapped = new GmvError(isTimeout ? `GMV timeout for ${path}` : `GMV request failed for ${path}`, {
        code: isTimeout ? 'TIMEOUT' : 'NETWORK',
      });
      recordError(wrapped.message);
      throw wrapped;
    } finally {
      clearTimeout(timer);
      const timing = { path: path.split('?')[0], durationMs: Math.max(0, now() - startedAt), outcome };
      if (timings.size >= 50 && !timings.has(timing.path)) timings.delete(timings.keys().next().value);
      timings.set(timing.path, timing);
      // Diagnostics cannot turn a successful request into a failure.
      try { onTiming(timing); } catch { /* logging is best effort */ }
    }
  }

  return { get, stats: () => ({ configured: !!apiKey, ...stats, endpointTimings: [...timings.values()] }) };
}

module.exports = { createGmvClient, GmvError };

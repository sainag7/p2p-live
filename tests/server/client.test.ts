import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createGmvClient } = require('../../server/gmv/client.cjs');

const KEY = 'test-key-123';

function okFetch(body: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
}

describe('createGmvClient', () => {
  it('records bounded endpoint latency/outcome without credentials and tolerates logging failures', async () => {
    let t = 0;
    const onTiming = vi.fn(() => { throw new Error('logger failed'); });
    const client = createGmvClient({ apiKey: KEY, now: () => t, onTiming,
      fetchImpl: async () => { t += 1100; return { ok: true, json: async () => [] }; } });
    await expect(client.get('/routes')).resolves.toEqual([]);
    expect(client.stats().endpointTimings).toEqual([{ path: '/routes', durationMs: 1100, outcome: 'ok' }]);
    expect(JSON.stringify(client.stats())).not.toContain(KEY);
    expect(onTiming).toHaveBeenCalledWith({ path: '/routes', durationMs: 1100, outcome: 'ok' });
    for (let i = 0; i < 51; i++) await client.get(`/routes/${i}`);
    expect(client.stats().endpointTimings).toHaveLength(50);
  });
  it('sends Api-Key and Accept headers and returns parsed JSON', async () => {
    const fetchImpl = okFetch([{ id: 1 }]);
    const client = createGmvClient({ apiKey: KEY, baseUrl: 'https://gmv.test/portal', fetchImpl });
    await expect(client.get('/routes')).resolves.toEqual([{ id: 1 }]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://gmv.test/portal/routes');
    expect(init.headers).toMatchObject({ 'Api-Key': KEY, Accept: 'application/json' });
    expect(client.stats()).toMatchObject({ configured: true, callCount: 1, lastError: null });
  });

  it('throws GmvError with the status on non-2xx, without leaking the key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    const client = createGmvClient({ apiKey: KEY, fetchImpl });
    const err = await client.get('/routes').catch((e: any) => e);
    expect(err.name).toBe('GmvError');
    expect(err.status).toBe(403);
    expect(err.message).not.toContain(KEY);
    expect(client.stats().lastError).toContain('403');
  });

  it('throws MISSING_KEY without calling fetch when no key is configured', async () => {
    const fetchImpl = okFetch([]);
    const client = createGmvClient({ apiKey: undefined, fetchImpl });
    const err = await client.get('/routes').catch((e: any) => e);
    expect(err.code).toBe('MISSING_KEY');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(client.stats().configured).toBe(false);
  });

  it('aborts and throws TIMEOUT when GMV is slow', async () => {
    const fetchImpl = vi.fn((_url: string, init: any) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      });
    }));
    const client = createGmvClient({ apiKey: KEY, fetchImpl, timeoutMs: 10 });
    const err = await client.get('/routes/6566/vehicles').catch((e: any) => e);
    expect(err.code).toBe('TIMEOUT');
    expect(err.message).toContain('/routes/6566/vehicles');
  });
});

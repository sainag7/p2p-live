import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createTtlCache } = require('../../server/gmv/cache.cjs');

function setup() {
  let t = 0;
  const cache = createTtlCache({ now: () => t });
  return { cache, advance: (ms: number) => { t += ms; } };
}

describe('createTtlCache', () => {
  it('serves a fresh value without refetching', async () => {
    const { cache, advance } = setup();
    const fetchFn = vi.fn().mockResolvedValue('v1');
    await cache.getOrFetch('k', 1000, fetchFn);
    advance(500);
    const r = await cache.getOrFetch('k', 1000, fetchFn);
    expect(r).toMatchObject({ value: 'v1', stale: false });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(cache.stats().hits).toBe(1);
  });

  it('shares one in-flight fetch between concurrent callers', async () => {
    const { cache } = setup();
    const fetchFn = vi.fn().mockResolvedValue('v1');
    const [a, b] = await Promise.all([cache.getOrFetch('k', 1000, fetchFn), cache.getOrFetch('k', 1000, fetchFn)]);
    expect(a.value).toBe('v1');
    expect(b.value).toBe('v1');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('refetches after the TTL expires', async () => {
    const { cache, advance } = setup();
    const fetchFn = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');
    await cache.getOrFetch('k', 1000, fetchFn);
    advance(1001);
    const r = await cache.getOrFetch('k', 1000, fetchFn);
    expect(r.value).toBe('v2');
  });

  it('returns the last value as stale when a refresh fails within the stale window', async () => {
    const { cache, advance } = setup();
    const fetchFn = vi.fn().mockResolvedValueOnce('v1').mockRejectedValueOnce(new Error('down'));
    await cache.getOrFetch('k', 1000, fetchFn, { staleMs: 5000 });
    advance(2000);
    const r = await cache.getOrFetch('k', 1000, fetchFn, { staleMs: 5000 });
    expect(r).toMatchObject({ value: 'v1', stale: true });
  });

  it('throws when the last value is older than ttl + staleMs', async () => {
    const { cache, advance } = setup();
    const fetchFn = vi.fn().mockResolvedValueOnce('v1').mockRejectedValue(new Error('down'));
    await cache.getOrFetch('k', 1000, fetchFn, { staleMs: 5000 });
    advance(7000);
    await expect(cache.getOrFetch('k', 1000, fetchFn, { staleMs: 5000 })).rejects.toThrow('down');
  });

  it('does not retry a failed fetch until the TTL has passed', async () => {
    const { cache, advance } = setup();
    const fetchFn = vi.fn().mockRejectedValue(new Error('down'));
    await expect(cache.getOrFetch('k', 1000, fetchFn)).rejects.toThrow('down');
    advance(500);
    await expect(cache.getOrFetch('k', 1000, fetchFn)).rejects.toThrow('down');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    advance(600);
    await expect(cache.getOrFetch('k', 1000, fetchFn)).rejects.toThrow('down');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('peek returns the stored value or null', async () => {
    const { cache } = setup();
    expect(cache.peek('k')).toBeNull();
    await cache.getOrFetch('k', 1000, async () => 'v1');
    expect(cache.peek('k')).toMatchObject({ value: 'v1' });
  });

  it('retries failures on a separate short TTL and shares the recovery request', async () => {
    const { cache, advance } = setup();
    const fetchFn = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue('recovered');
    const options = { errorTtlMs: 30_000 };
    await expect(cache.getOrFetch('network', 21_600_000, fetchFn, options)).rejects.toThrow('down');
    advance(29_999);
    await expect(cache.getOrFetch('network', 21_600_000, fetchFn, options)).rejects.toThrow('down');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    advance(1);
    const recovered = await Promise.all([
      cache.getOrFetch('network', 21_600_000, fetchFn, options),
      cache.getOrFetch('network', 21_600_000, fetchFn, options),
    ]);
    expect(recovered.map(r => r.value)).toEqual(['recovered', 'recovered']);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    advance(21_599_999);
    expect((await cache.getOrFetch('network', 21_600_000, fetchFn, options)).value).toBe('recovered');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('does not extend the age of stale data when using a shorter error TTL', async () => {
    const { cache, advance } = setup();
    const fetchFn = vi.fn().mockResolvedValueOnce('last good').mockRejectedValue(new Error('down'));
    const options = { staleMs: 5000, errorTtlMs: 100 };
    await cache.getOrFetch('network', 1000, fetchFn, options);
    advance(1000);
    expect(await cache.getOrFetch('network', 1000, fetchFn, options)).toMatchObject({ value: 'last good', stale: true, fetchedAt: 0 });
    advance(100);
    expect(await cache.getOrFetch('network', 1000, fetchFn, options)).toMatchObject({ stale: true, fetchedAt: 0 });
    advance(4900);
    await expect(cache.getOrFetch('network', 1000, fetchFn, options)).rejects.toThrow('down');
  });
});

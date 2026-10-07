import { describe, expect, it, vi } from 'vitest';
import { createGeocodeClient } from '../../utils/geocode';
const near = { lat: 35.91, lon: -79.04 };
const body = { results: [{ id: '1', place_name: 'Market, Chapel Hill, NC', coordinates: [-79.04, 35.91] }] };
const signal = () => new AbortController().signal;
describe('address result caching', () => {
  it('reuses normalized queries and expires results without persisting them', async () => {
    let now = 0;
    const fetchImpl = vi.fn(async () => Response.json(body));
    const client = createGeocodeClient({ fetchImpl, now: () => now, ttlMs: 100 });
    const result = await client.search('market', near, signal());
    expect(client.cached(' MARKET ', near)).toEqual(result);
    expect(await client.search(' Market ', near, signal())).toEqual(result);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(client.cached('market', { ...near, lat: 35.94 })).toBeNull();
    now = 100;
    expect(client.cached('market', near)).toBeNull();
    await client.search('market', near, signal());
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('bounds cache size and caches successful empty results', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ results: [] }));
    const client = createGeocodeClient({ fetchImpl, maxEntries: 2 });
    for (const query of ['aaa', 'bbb', 'ccc']) await client.search(query, near, signal());
    expect(client.cached('aaa', near)).toBeNull();
    expect(client.cached('bbb', near)).toEqual([]);
    await client.search('ccc', near, signal());
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('retries failures and does not cache a response cancelled during body parsing', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce({ ok: true, json: async () => { controller.abort(); return body; } })
      .mockResolvedValueOnce(Response.json(body));
    const client = createGeocodeClient({ fetchImpl });
    await expect(client.search('market', near, signal())).rejects.toThrow();
    await expect(client.search('market', near, controller.signal)).rejects.toThrow();
    expect(client.cached('market', near)).toBeNull();
    expect(await client.search('market', near, signal())).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

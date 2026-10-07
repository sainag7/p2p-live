import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { once } from 'node:events';

const require = createRequire(import.meta.url);
const { createApiServer } = require('../../server/index.cjs');

let server: ReturnType<typeof createApiServer> | null = null;

async function startApi(options = {}) {
  const gmvService = {
    getNetwork: async () => ({ routes: [{ id: 'P2P_EXPRESS' }], stops: [{ id: 'union' }] }),
    getSnapshot: async () => ({ status: 'live', vehicles: [{ id: 'bus-1' }], arrivalsByStop: {}, messages: [{ id: 'service-alert' }] }),
  };
  server = createApiServer({ gmvService, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  if (!server) return;
  server.close();
  await once(server, 'close');
  server = null;
});

describe('public rider API', () => {
  it('compresses larger transit responses without changing data or freshness', async () => {
    const payload = { routes: [], stops: Array.from({ length: 500 }, (_, id) => ({ id, name: `Example stop ${id}` })) };
    const baseUrl = await startApi({ gmvService: { getNetwork: async () => payload, getSnapshot: async () => payload } });
    for (const [endpoint, freshness] of [['network', 'public, max-age=300'], ['snapshot', 'no-store']]) {
      const response = await fetch(`${baseUrl}/api/live/${endpoint}`, { headers: { 'Accept-Encoding': 'gzip' } });
      expect(response.headers.get('Content-Encoding')).toBe('gzip');
      expect(response.headers.get('Vary')).toContain('Accept-Encoding');
      expect(response.headers.get('Cache-Control')).toBe(freshness);
      expect(await response.json()).toEqual(payload);
    }
    const plain = await fetch(`${baseUrl}/api/live/network`, { headers: { 'Accept-Encoding': 'gzip;q=0' } });
    expect(plain.headers.get('Content-Encoding')).toBeNull();
    expect(await plain.json()).toEqual(payload);
  });

  it('shares simultaneous walks and retries an upstream failure', async () => {
    const nativeFetch = fetch;
    let upstreamCalls = 0;
    const route = { duration: 120, distance: 160, geometry: { type: 'LineString', coordinates: [[-79.04, 35.9], [-79.05, 35.91]] }, legs: [] };
    vi.stubGlobal('fetch', async (url, init) => {
      if (!String(url).startsWith('https://api.mapbox.com/')) return nativeFetch(url, init);
      upstreamCalls++;
      await new Promise(resolve => setTimeout(resolve, 20));
      return upstreamCalls === 1 ? new Response('', { status: 503 }) : Response.json({ routes: [route] });
    });
    const baseUrl = await startApi({ mapboxToken: 'fake-test-token' });
    const url = `${baseUrl}/api/mapbox/directions/walk?from=-79.04,35.9&to=-79.05,35.91`;
    const failed = await Promise.all([fetch(url), fetch(url)]);
    expect(failed.map(response => response.status)).toEqual([500, 500]);
    expect(upstreamCalls).toBe(1);
    const recovered = await Promise.all([fetch(url), fetch(url)]);
    expect(recovered.map(response => response.status)).toEqual([200, 200]);
    expect(upstreamCalls).toBe(2);
    expect(await recovered[0].json()).toMatchObject({ durationSec: 120, distanceMeters: 160 });
    expect((await fetch(url)).status).toBe(200);
    expect(upstreamCalls).toBe(2);
  });

  it('continues serving GMV network, arrivals, vehicles, and service status data', async () => {
    const baseUrl = await startApi();
    const [network, snapshot] = await Promise.all([
      fetch(`${baseUrl}/api/live/network`),
      fetch(`${baseUrl}/api/live/snapshot`),
    ]);

    expect(network.status).toBe(200);
    await expect(network.json()).resolves.toMatchObject({ routes: [{ id: 'P2P_EXPRESS' }], stops: [{ id: 'union' }] });
    expect(snapshot.status).toBe(200);
    await expect(snapshot.json()).resolves.toMatchObject({ status: 'live', vehicles: [{ id: 'bus-1' }], messages: [{ id: 'service-alert' }] });
  });

  it('does not expose retired auth, messaging, operations, or AI endpoints', async () => {
    const baseUrl = await startApi();
    const responses = await Promise.all([
      fetch(`${baseUrl}/api/auth/login`, { method: 'POST' }),
      fetch(`${baseUrl}/api/messages`),
      fetch(`${baseUrl}/api/ops/complaints/summary`, { method: 'POST' }),
      fetch(`${baseUrl}/api/admin-optimization-summary`, { method: 'POST' }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
  });
});

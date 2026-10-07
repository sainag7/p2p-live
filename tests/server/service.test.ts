import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createGmvService } = require('../../server/gmv/service.cjs');
const { createTtlCache } = require('../../server/gmv/cache.cjs');

const SHAPE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const stop = (id: number, name: string, seq: number, dist: number) => ({
  stopSequence: seq, shapeDistanceTraveled: dist, stop: { id, name, lat: 35.9 + id / 1000, lon: -79.05 },
});

function fixtures(): Record<string, unknown> {
  return {
    '/routes': [
      { id: 6566, name: 'P2P Express', shortName: 'Express', color: '#383FFF', textColor: '#FFFFFF' },
      { id: 6564, name: 'Baity Hill', shortName: 'BH', color: '#AD42FF', textColor: '#FFFFFF' },
    ],
    '/routes/6566/patterns': [
      { id: 100, name: 'P2P Express', shape: SHAPE },
      { id: 101, name: 'Football - P2P Express', shape: SHAPE },
    ],
    '/routes/6564/patterns': [{ id: 200, name: 'Baity Hill', shape: SHAPE }],
    '/routes/6566/patterns/100/stops': [stop(1, 'Stop A', 0, 0), stop(2, 'Stop B', 1, 400)],
    '/routes/6566/patterns/101/stops': [stop(1, 'Stop A', 0, 0), stop(3, 'Stop C', 1, 700)],
    '/routes/6564/patterns/200/stops': [stop(2, 'Stop B', 0, 0), stop(4, 'Stop D', 1, 900)],
    '/routes/6566/vehicles': [{
      id: 9001, name: 'Bus 1', lat: 35.9, lon: -79.05, headingDegrees: 90, speed: 20, capacity: 40,
      passengerLoad: 0.5, lastUpdated: '2026-09-14T22:59:50Z', shapeDistanceTraveled: 100, pattern_id: 100,
    }],
    '/routes/6564/vehicles': [],
    '/routes/6566/patterns/100/arrivals': [
      { vehicle: { id: 9001 }, stop: { id: 2 }, secondsToArrival: 120, schedulePrediction: false },
      { vehicle: { id: 9001 }, stop: { id: 1 }, secondsToArrival: 400, schedulePrediction: 'false' },
      { vehicle: null, stop: { id: 1 }, secondsToArrival: 900, schedulePrediction: true },
    ],
    '/v2/messages': [
      { id: 5, name: 'Detour', text: 'Granville closed', start: null, end: null, assignments: { global: false, routes: [{ id: 6566 }], stops: [] } },
      { id: 6, name: 'Other portal', text: 'x', start: null, end: null, assignments: { global: false, routes: [{ id: 1 }], stops: [] } },
    ],
  };
}

function fakeClient(data: Record<string, unknown>) {
  const state = { failing: false, calls: [] as string[] };
  return {
    state,
    async get(path: string) {
      state.calls.push(path);
      if (state.failing) throw Object.assign(new Error('GMV down'), { code: 'NETWORK' });
      if (!(path in data)) throw Object.assign(new Error(`404 ${path}`), { status: 404 });
      return structuredClone(data[path]);
    },
    stats: () => ({ configured: true, callCount: state.calls.length, lastSuccessAt: null, lastErrorAt: null, lastError: null }),
  };
}

function setup(data = fixtures()) {
  let t = Date.parse('2026-09-14T23:00:00Z');
  const now = () => t;
  const client = fakeClient(data);
  const service = createGmvService({
    client, now, cache: createTtlCache({ now }),
    defaultPattern: { P2P_EXPRESS: 101, BAITY_HILL: 999 },
  });
  return { service, client, advance: (ms: number) => { t += ms; } };
}

describe('getNetwork', () => {
  it('discovers patterns and stops while independent route metadata is still pending', async () => {
    const data = fixtures();
    const client = fakeClient(data);
    const get = client.get.bind(client);
    let resolveMetadata!: (value: unknown) => void;
    client.get = (path: string) => path === '/routes'
      ? new Promise(resolve => { resolveMetadata = resolve; }) : get(path);
    const service = createGmvService({ client });
    const pending = service.getNetwork();
    await Promise.resolve();
    await Promise.resolve();
    expect(client.state.calls).toContain('/routes/6566/patterns/100/stops');
    resolveMetadata(data['/routes']);
    expect((await pending).routes.find((r: any) => r.id === 'P2P_EXPRESS').shortName).toBe('Express');
  });

  it('recovers from a cold-load failure after 30 seconds, not six hours', async () => {
    const { service, client, advance } = setup();
    client.state.failing = true;
    await expect(service.getNetwork()).rejects.toThrow('GMV down');
    client.state.failing = false;
    advance(29_999);
    await expect(service.getNetwork()).rejects.toThrow('GMV down');
    advance(1);
    const network = await service.getNetwork();
    expect(network.routes).toHaveLength(2);
    expect(network.stops).toHaveLength(4);
  });

  it('keeps route geometry and stops when service has no vehicles', async () => {
    const data = fixtures();
    data['/routes/6566/vehicles'] = [];
    const { service } = setup(data);
    expect((await service.getSnapshot()).status).toBe('no-service');
    const network = await service.getNetwork();
    expect(network.routes.every((r: any) => r.patterns.some((p: any) => p.geometry.coordinates.length > 1 && p.stops.length > 0))).toBe(true);
    expect(network.stops).toHaveLength(4);
  });

  it('retains a last-good network on failure only within the existing stale window', async () => {
    const { service, client, advance } = setup();
    const network = await service.getNetwork();
    client.state.failing = true;
    advance(6 * 60 * 60 * 1000);
    expect(await service.getNetwork()).toEqual(network);
    advance(30_000);
    expect(await service.getNetwork()).toEqual(network);
    advance(12 * 60 * 60 * 1000);
    await expect(service.getNetwork()).rejects.toThrow('GMV down');
  });

  it('builds routes with canonical ids, decoded patterns and deduped stops', async () => {
    const { service } = setup();
    const net = await service.getNetwork();
    const express = net.routes.find((r: any) => r.id === 'P2P_EXPRESS');
    expect(express).toMatchObject({ gmvId: 6566, name: 'P2P Express', shortName: 'Express', color: '#383FFF' });
    expect(express.patterns.map((p: any) => p.id)).toEqual([100, 101]);
    expect(express.patterns[0].geometry.coordinates).toHaveLength(3);
    expect(net.stops.map((s: any) => s.id).sort()).toEqual(['1', '2', '3', '4']);
  });

  it('picks the configured default pattern, falling back to the one named like the route', async () => {
    const { service } = setup();
    const net = await service.getNetwork();
    expect(net.routes.find((r: any) => r.id === 'P2P_EXPRESS').defaultPatternId).toBe(101);
    expect(net.routes.find((r: any) => r.id === 'BAITY_HILL').defaultPatternId).toBe(200);
  });

  it('prefers the pattern buses were last seen on', async () => {
    const { service } = setup();
    await service.getSnapshot();
    const net = await service.getNetwork();
    expect(net.routes.find((r: any) => r.id === 'P2P_EXPRESS').defaultPatternId).toBe(100);
  });
});

describe('getSnapshot', () => {
  it('rechecks notice expiry when a vehicle response arrives later', async () => {
    const data = fixtures();
    (data['/v2/messages'] as any[])[0].end = '2026-09-14T23:00:08Z';
    const { service, client, advance } = setup(data);
    expect((await service.getSnapshot()).messages).toHaveLength(1);
    const get = client.get.bind(client);
    let finish!: (value: unknown) => void;
    client.get = (path: string) => path === '/routes/6564/vehicles' ? new Promise(resolve => { finish = resolve; }) : get(path);
    advance(6000);
    const pending = service.getSnapshot();
    await Promise.resolve(); await Promise.resolve();
    advance(3000);
    finish([]);
    expect((await pending).messages).toEqual([]);
  });

  it('does not block live buses on slow notices, then includes the completed notices on the next poll', async () => {
    vi.useFakeTimers();
    try {
      const data = fixtures(), client = fakeClient(data), get = client.get.bind(client);
      let finish!: (value: unknown) => void;
      client.get = (path: string) => path === '/v2/messages' ? new Promise(resolve => { finish = resolve; }) : get(path);
      const service = createGmvService({ client });
      const pending = service.getSnapshot();
      await vi.advanceTimersByTimeAsync(150);
      expect(await pending).toMatchObject({ status: 'live', messagesPending: true, messages: [] });
      finish(data['/v2/messages']);
      await vi.advanceTimersByTimeAsync(0);
      expect(await service.getSnapshot()).toMatchObject({ status: 'live', messagesPending: false, messages: [expect.objectContaining({ title: 'Detour' })] });
    } finally { vi.useRealTimers(); }
  });

  it('keeps last-good active notices during refresh but never extends their stale window', async () => {
    vi.useFakeTimers();
    try {
      const { service, client, advance } = setup();
      const initial = await service.getSnapshot();
      const get = client.get.bind(client);
      client.get = (path: string) => path === '/v2/messages' ? new Promise(() => {}) : get(path);
      advance(60_000);
      let pending = service.getSnapshot();
      await vi.advanceTimersByTimeAsync(150);
      expect(await pending).toMatchObject({ messagesPending: true, messages: initial.messages });
      advance(5 * 60_000);
      pending = service.getSnapshot();
      await vi.advanceTimersByTimeAsync(150);
      expect(await pending).toMatchObject({ messagesPending: true, messages: [] });
    } finally { vi.useRealTimers(); }
  });

  it('fetches Express arrivals without waiting for Baity Hill vehicles', async () => {
    const data = fixtures();
    const client = fakeClient(data);
    const get = client.get.bind(client);
    let resolveBaity!: (value: unknown) => void;
    client.get = (path: string) => path === '/routes/6564/vehicles'
      ? new Promise(resolve => { resolveBaity = resolve; }) : get(path);
    const service = createGmvService({ client });
    const pending = service.getSnapshot();
    await Promise.resolve();
    await Promise.resolve();
    expect(client.state.calls).toContain('/routes/6566/patterns/100/arrivals');
    resolveBaity([]);
    expect((await pending).vehicles[0].nextStopId).toBe('2');
  });

  it('returns live vehicles with next stops, per-stop arrivals, active patterns and messages', async () => {
    const { service } = setup();
    const snap = await service.getSnapshot();
    expect(snap.status).toBe('live');
    expect(snap.activePatternIds).toEqual({ P2P_EXPRESS: 100 });
    expect(snap.vehicles).toHaveLength(1);
    expect(snap.vehicles[0]).toMatchObject({ id: '9001', routeId: 'P2P_EXPRESS', nextStopId: '2', nextStopEtaSec: 120, stale: false });
    expect(snap.arrivalsByStop['1'].map((a: any) => a.etaSec)).toEqual([400, 900]);
    expect(snap.messages).toHaveLength(1);
    expect(snap.messages[0].routeIds).toEqual(['P2P_EXPRESS']);
  });

  it('reports no-service when GMV returns no vehicles', async () => {
    const data = fixtures();
    data['/routes/6566/vehicles'] = [];
    const { service } = setup(data);
    const snap = await service.getSnapshot();
    expect(snap.status).toBe('no-service');
    expect(snap.vehicles).toEqual([]);
  });

  it('serves the last snapshot as degraded for 30 s after a failure, then unavailable', async () => {
    const { service, client, advance } = setup();
    await service.getSnapshot();
    client.state.failing = true;
    advance(10_000);
    const degraded = await service.getSnapshot();
    expect(degraded.status).toBe('degraded');
    expect(degraded.vehicles).toHaveLength(1);
    advance(30_000);
    const unavailable = await service.getSnapshot();
    expect(unavailable.status).toBe('unavailable');
    expect(unavailable.vehicles).toEqual([]);
  });

  it('reports unavailable when the key is missing', async () => {
    const { service, client } = setup();
    client.get = async () => { throw Object.assign(new Error('GMV_RTPI_API_KEY is not set'), { code: 'MISSING_KEY' }); };
    const snap = await service.getSnapshot();
    expect(snap).toMatchObject({ status: 'unavailable', vehicles: [], arrivalsByStop: {}, messages: [] });
  });

  it('hits each vehicle endpoint at most once per 6 s across concurrent requests', async () => {
    const { service, client } = setup();
    await Promise.all([service.getSnapshot(), service.getSnapshot(), service.getSnapshot()]);
    expect(client.state.calls.filter((c) => c === '/routes/6566/vehicles')).toHaveLength(1);
  });

  it('falls back to the default pattern for arrivals when vehicles omit pattern_id', async () => {
    const data = fixtures();
    (data['/routes/6566/vehicles'] as any[])[0].pattern_id = undefined;
    data['/routes/6566/patterns/101/arrivals'] = [];
    const { service, client } = setup(data);
    await service.getSnapshot();
    expect(client.state.calls).toContain('/routes/6566/patterns/101/arrivals');
  });
});

describe('diagnostics', () => {
  it('exposes client stats and cache hits without the key', async () => {
    const { service } = setup();
    await service.getSnapshot();
    await service.getSnapshot();
    const d = service.diagnostics();
    expect(d.configured).toBe(true);
    expect(d.cacheHits).toBeGreaterThan(0);
  });
});

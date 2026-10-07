import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeTripOptions, getWalkDirections } from '../../utils/multimodalRouting';
import { getDistanceMeters } from '../../utils/geo';
import { makeNetwork, makeSnapshot, makeVehicle } from '../fixtures/transit';

/** Straight-line walking at 1.4 m/s in place of Mapbox directions. */
function mockWalking() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const params = new URL(url, 'http://localhost').searchParams;
    const [from, to] = ['from', 'to'].map(k => params.get(k)!.split(',').map(Number));
    const meters = getDistanceMeters({ lon: from[0], lat: from[1] }, { lon: to[0], lat: to[1] });
    return Response.json({ durationSec: meters / 1.4, distanceMeters: meters, geometry: { type: 'LineString', coordinates: [from, to] }, steps: [] });
  }));
}

const network = makeNetwork();
const stop = (id: string) => network.stops.find(s => s.id === id)!;
// Afternoon: outside scheduled hours, so only live buses count.
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 14, 14, 0)); mockWalking(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('computeTripOptions', () => {
  it('publishes a usable walk while bus candidates are pending and preserves the final plan', async () => {
    const origin = { lat: 35.90331, lon: -79.04031 };
    const destination = { id: 'progressive', name: 'Progressive destination', lat: 35.91031, lon: -79.04031 };
    const onWalkReady = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const params = new URL(url, 'http://localhost').searchParams;
      const [from, to] = ['from', 'to'].map(k => params.get(k)!.split(',').map(Number));
      const direct = from[1] === origin.lat && to[1] === destination.lat;
      await new Promise(resolve => setTimeout(resolve, direct ? 100 : 300));
      return Response.json({ durationSec: 300, distanceMeters: 400, geometry: { type: 'LineString', coordinates: [from, to] }, steps: [] });
    }));
    let completed = false;
    const pending = computeTripOptions({ origin, destination, network, snapshot: makeSnapshot(), onWalkReady }).then(options => { completed = true; return options; });
    await vi.advanceTimersByTimeAsync(100);
    expect(onWalkReady).toHaveBeenCalledOnce();
    expect(onWalkReady.mock.calls[0][0].segments[0].type).toBe('walk');
    expect(completed).toBe(false);
    await vi.runAllTimersAsync();
    const options = await pending;
    expect(options.walk).toBe(onWalkReady.mock.calls[0][0]);
    expect(options.bus).not.toBeNull();
  });

  const trip = (snapshot = makeSnapshot(), origin = stop('b')) =>
    computeTripOptions({ origin, destination: { id: 'dest', name: 'Stop C area', lat: stop('c').lat, lon: stop('c').lon }, network, snapshot });

  it('offers the bus even when walking is faster', async () => {
    const slowBus = makeVehicle({ upcomingStops: [{ stopId: 'b', etaSec: 900 }, { stopId: 'c', etaSec: 1110 }] });
    const options = await trip(makeSnapshot({ vehicles: [slowBus], arrivalsByStop: {} }));
    expect(options.walk).not.toBeNull();
    expect(options.bus?.segments.map(s => s.type)).toEqual(['walk', 'bus', 'walk']);
    expect(options.recommended).toBe('walk');
    expect(options.bus!.segments[1]).toMatchObject({ routeId: 'P2P_EXPRESS', fromName: 'Stop B', toName: 'Stop C', waitSec: 900, durationSec: 210 });
  });
  it('recommends the bus when it is clearly faster', async () => {
    const options = await trip();
    expect(options.recommended).toBe('bus');
    expect(options.bus!.arrivalTime.getTime() - options.bus!.startTime.getTime()).toBe(300_000);
  });
  it('explains a missing bus option', async () => {
    expect(await trip(makeSnapshot({ vehicles: [], arrivalsByStop: {} }))).toMatchObject({ bus: null, busUnavailable: 'not-running' });
    expect(await trip(makeSnapshot(), { id: 'far', name: 'Far', lat: 35.95, lon: -79.1 })).toMatchObject({ bus: null, busUnavailable: 'no-stops' });
  });
  it('overlaps cold walks while preserving the best bus itinerary', async () => {
    vi.resetModules();
    const { computeTripOptions: coldPlan } = await import('../../utils/multimodalRouting');
    const immediateFetch = fetch;
    let inFlight = 0, peak = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      peak = Math.max(peak, ++inFlight);
      await new Promise(resolve => setTimeout(resolve, 150));
      inFlight--;
      return immediateFetch(url);
    }));
    const start = Date.now();
    const pending = coldPlan({ origin: stop('b'), destination: { ...stop('c'), id: 'cold', name: 'Stop C' }, network, snapshot: makeSnapshot() });
    await vi.runAllTimersAsync();
    const options = await pending;
    expect(Date.now() - start).toBeLessThan(900);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
    expect(options.recommended).toBe('bus');
    expect(options.bus?.segments[1]).toMatchObject({ fromName: 'Stop B', toName: 'Stop C', durationSec: 210 });
  });
});

describe('getWalkDirections', () => {
  // Coordinates no other test uses, so the shared cache starts empty for them.
  const a = { lat: 35.9001, lon: -79.0301 }, b = { lat: 35.9002, lon: -79.0302 };
  it('reuses a recent walk between the same points', async () => {
    const fetchMock = vi.mocked(fetch);
    const first = await getWalkDirections(a, b);
    const second = await getWalkDirections({ lat: a.lat + 1e-7, lon: a.lon }, b);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1);
    await getWalkDirections(a, b);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('asks again after a failed walk instead of caching the failure', async () => {
    const c = { lat: 35.9003, lon: -79.0303 };
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    expect(await getWalkDirections(a, c)).toBeNull();
    await getWalkDirections(a, c);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

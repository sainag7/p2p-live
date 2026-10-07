/** Local-only Vite QA entry. Never imported by the production application. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../../index.css';
import App from '../../App';
import { makeNetwork, makeSnapshot, makeVehicle } from '../fixtures/transit';
import { TransitProvider } from '../../context/TransitProvider';

const params = new URLSearchParams(location.search);
const mode = params.has('beforeService') ? 'no-service' : params.get('status');
if (params.has('beforeService') || params.has('duringService')) {
  const fixtureTime = params.has('beforeService') ? '2026-09-15T18:00:00Z' : '2026-09-16T01:00:00Z';
  const RealDate = Date;
  class AfternoonDate extends RealDate {
    constructor(value?: string | number) { super(value ?? fixtureTime); }
    static now() { return new RealDate(fixtureTime).getTime(); }
  }
  window.Date = AfternoonDate as DateConstructor;
}
const geo = params.get('geo') ?? 'campus';
const demoEtaSec = Number(params.get('eta') ?? 120);
const position = () => ({ coords: { latitude: geo === 'outside' ? 40.71 : 35.9105, longitude: geo === 'outside' ? -74.0 : -79.0478, accuracy: 10 }, timestamp: Date.now() });
const denied = { code: 1, PERMISSION_DENIED: 1 };
const watches = new Map<number, ReturnType<typeof setInterval>>();
let watchIds = 0;
Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
  getCurrentPosition(success, failure) {
    if (geo === 'loading') return;
    queueMicrotask(() => geo === 'denied' ? failure(denied) : success(position()));
  },
  // Phones send a new position about once a second while the page is open.
  watchPosition(success, failure) {
    const id = ++watchIds;
    if (geo === 'loading') return id;
    const send = () => geo === 'denied' ? failure?.(denied) : success(position());
    queueMicrotask(send);
    if (geo !== 'denied') watches.set(id, setInterval(send, 1000));
    return id;
  },
  clearWatch(id) { clearInterval(watches.get(id)); watches.delete(id); },
} });
const originalFetch = window.fetch.bind(window);
let networkAttempts = 0;
let snapshotAttempts = 0;
window.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes('/api/live/network')) {
    networkAttempts += 1;
    if (params.has('networkUnavailable') || networkAttempts <= Number(params.get('networkFailures') ?? 0)) return new Response('{}', { status: 503 });
    if (params.has('fixtureNetwork')) return Response.json(makeNetwork());
  }
  if (url.includes('/api/mapbox/directions/walk') && params.has('walkFailure')) return new Response('{}', { status: 503 });
  if (url.includes('/api/live/snapshot') && mode) {
    snapshotAttempts += 1;
    if (params.has('trackingFailsAfterLoad') && snapshotAttempts > 1) return Response.json(makeSnapshot({ status: 'unavailable', vehicles: [], arrivalsByStop: {}, activePatternIds: {} }));
    if (mode === 'no-service') return Response.json(makeSnapshot({ status: 'no-service', vehicles: [], arrivalsByStop: {}, activePatternIds: {} }));
    if (mode === 'loading') return new Promise(() => {});
    if (mode === 'unavailable') return new Response('{}', { status: 503 });
    if (mode === 'live' || mode === 'degraded') {
      const network = params.has('fixtureNetwork') ? makeNetwork() : await (await originalFetch('/api/live/network')).json();
      const vehicles = network.routes.map((route, i) => {
        const pattern = route.patterns.find(p => p.id === route.defaultPatternId) ?? route.patterns[0];
        const stop = network.stops.find(s => s.id === pattern.stops[Math.min(2, pattern.stops.length - 1)].stopId);
        return makeVehicle({ id: `demo-${i}`, name: `Demo bus ${i + 1}`, routeId: route.id, routeName: route.name, patternId: pattern.id,
          lat: stop.lat, lon: stop.lon, speedMps: 0, distAlong: null, heading: i ? 210 : 80, nextStopId: stop.id, nextStopEtaSec: demoEtaSec,
          stale: mode === 'degraded', lastUpdated: new Date().toISOString(), upcomingStops: [{ stopId: stop.id, etaSec: demoEtaSec }] });
      });
      if (params.has('longStop')) vehicles[1].nextStopId = network.stops.find(s => s.name.includes('Horton'))?.id ?? vehicles[1].nextStopId;
      const arrivalsByStop = Object.fromEntries(network.stops.map(stop => [stop.id, vehicles.filter(v => network.routes.find(r => r.id === v.routeId).patterns.some(p => p.stops.some(s => s.stopId === stop.id))).map(v => ({routeId:v.routeId, vehicleId:v.id, etaSec:demoEtaSec, scheduled:false}))]));
      const messages = params.has('alert') ? [{id:'home-demo-alert',title:'Demo service notice',body:'Check your boarding stop before travelling.',global:true,routeIds:[],stopIds:[],startsAt:null,endsAt:null}] : [];
      return Response.json({ fetchedAt: new Date().toISOString(), status: mode, vehicles, arrivalsByStop, messages,
        activePatternIds: Object.fromEntries(vehicles.map(v => [v.routeId, v.patternId])) });
    }
    const response = await originalFetch(input, init);
    const snapshot = await response.json();
    snapshot.status = mode;
    if (mode === 'no-service') { snapshot.vehicles = []; snapshot.arrivalsByStop = {}; }
    if (mode === 'degraded') snapshot.vehicles.forEach(v => { v.stale = true; });
    return Response.json(snapshot);
  }
  return originalFetch(input, init);
};
const originalMatchMedia = window.matchMedia.bind(window);
if (params.has('reducedMotion')) window.matchMedia = query => query === '(prefers-reduced-motion: reduce)' ? { ...originalMatchMedia(query), matches: true } as MediaQueryList : originalMatchMedia(query);
createRoot(document.getElementById('root')!).render(<React.StrictMode><MemoryRouter><TransitProvider><App /></TransitProvider></MemoryRouter></React.StrictMode>);

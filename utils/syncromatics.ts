import type { Stop, Vehicle, Route, Arrival } from '../types';

// Use a same-origin relative path. In dev, Vite proxies /api/* to the local
// server (which holds SYNCROMATICS_API_KEY). In prod, the server is co-located
// with the static frontend. We deliberately do NOT use VITE_API_BASE_URL here:
// pointing the frontend at a different origin that lacks the proxy/key would
// silently return empty data.
const BASE = '/api/syncromatics';

export class SyncromaticsError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'SyncromaticsError';
    this.status = status;
  }
}

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

async function getJson(path: string, init?: RequestInit): Promise<Json> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      // ignore
    }
    throw new SyncromaticsError(
      `Syncromatics ${path} returned ${res.status}${detail ? `: ${detail}` : ''}`,
      res.status
    );
  }
  return res.json();
}

function pick<T = unknown>(obj: Record<string, unknown>, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null) return v as T;
  }
  return undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function asString(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

function adaptStop(raw: unknown): Stop | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = asString(pick(r, ['id', 'stopId', 'ID']));
  const name = asString(pick(r, ['name', 'displayName', 'stopName', 'description']));
  const lat = asNumber(pick(r, ['latitude', 'lat']));
  const lon = asNumber(pick(r, ['longitude', 'lon', 'lng']));
  if (!id || !name || lat === undefined || lon === undefined) return null;
  return { id, name, lat, lon };
}

function adaptRoute(raw: unknown): Route | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = asString(pick(r, ['id', 'routeId', 'ID']));
  const name =
    asString(pick(r, ['name', 'displayName', 'longName'])) ||
    asString(pick(r, ['shortName'])) ||
    '';
  const color =
    asString(pick(r, ['color', 'routeColor'])) ||
    '#418FC5';
  if (!id) return null;
  const normalizedColor = color.startsWith('#') ? color : `#${color}`;
  return { id, name, color: normalizedColor };
}

function adaptVehicle(raw: unknown, routeId: string, routeName: string): Vehicle | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = asString(pick(r, ['id', 'vehicleId', 'ID']));
  const lat = asNumber(pick(r, ['latitude', 'lat']));
  const lon = asNumber(pick(r, ['longitude', 'lon', 'lng']));
  if (!id || lat === undefined || lon === undefined) return null;
  // Prefer numeric headingDegrees over the compass-string `heading` field.
  const heading =
    asNumber(pick(r, ['headingDegrees', 'bearing'])) ??
    asNumber(pick(r, ['heading'])) ??
    0;
  const speed = asNumber(pick(r, ['speed', 'speedMph']));
  const name = asString(pick(r, ['name', 'label']));
  const passengerLoad = asNumber(pick(r, ['passengerLoad']));
  const capacity = asNumber(pick(r, ['capacity']));
  return {
    id,
    name,
    routeId,
    routeName,
    lat,
    lon,
    heading,
    speed,
    passengerLoad,
    capacity,
  };
}

function adaptArrival(raw: unknown, fallbackStopId: string): Arrival | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const routeObj = (r.route && typeof r.route === 'object' ? r.route : {}) as Record<string, unknown>;
  const vehicleObj = (r.vehicle && typeof r.vehicle === 'object' ? r.vehicle : {}) as Record<string, unknown>;

  const stopId = asString(pick(r, ['stopId', 'stop_id'])) ?? fallbackStopId;
  const routeId =
    asString(pick(routeObj, ['id'])) ??
    asString(pick(r, ['routeId', 'route_id']));
  const routeName =
    asString(pick(routeObj, ['name'])) ??
    asString(pick(r, ['routeName', 'route_name'])) ??
    '';
  const vehicleId =
    asString(pick(vehicleObj, ['id'])) ??
    asString(pick(r, ['vehicleId', 'vehicle_id'])) ??
    '';

  const seconds = asNumber(pick(r, ['secondsToArrival']));
  const predicted = asString(pick(r, ['predictedArrivalTime', 'arrivalTime', 'predicted', 'time']));
  let minutes = asNumber(pick(r, ['minutesUntilArrival', 'minutes', 'eta', 'etaMin']));
  if (minutes === undefined && seconds !== undefined) {
    minutes = Math.max(0, Math.round(seconds / 60));
  }
  if (minutes === undefined && predicted) {
    const t = Date.parse(predicted);
    if (!Number.isNaN(t)) minutes = Math.max(0, Math.round((t - Date.now()) / 60000));
  }
  if (!routeId || minutes === undefined) return null;

  const predictedISO =
    predicted ??
    (seconds !== undefined
      ? new Date(Date.now() + seconds * 1000).toISOString()
      : new Date(Date.now() + minutes * 60000).toISOString());

  return {
    stopId,
    routeId,
    routeName,
    vehicleId,
    predictedArrivalTime: predictedISO,
    minutesUntilArrival: minutes,
  };
}

function asArray(payload: Json): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    for (const key of ['data', 'items', 'results', 'arrivals', 'stops', 'vehicles', 'routes']) {
      const v = obj[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

export async function fetchRoutes(): Promise<Route[]> {
  const payload = await getJson('/portal/routes');
  return asArray(payload).map(adaptRoute).filter((r): r is Route => r !== null);
}

export async function fetchStops(): Promise<Stop[]> {
  const payload = await getJson('/portal/stops');
  return asArray(payload).map(adaptStop).filter((s): s is Stop => s !== null);
}

/**
 * Ordered stops for a single route from `/portal/routes/{id}/stops`.
 * Sorts by `index`/`order`/`sequence` field if present, otherwise preserves response order.
 */
export async function fetchRouteStops(routeId: string): Promise<Stop[]> {
  const payload = await getJson(`/portal/routes/${encodeURIComponent(routeId)}/stops`);
  const raw = asArray(payload);
  const indexed = raw.map((item, i) => {
    const r = (item && typeof item === 'object') ? (item as Record<string, unknown>) : {};
    const order = asNumber(pick(r, ['index', 'order', 'sequence', 'position', 'stopIndex']));
    return { raw: item, idx: order ?? i, fallbackIdx: i };
  });
  const hasExplicitOrder = indexed.some((x) => {
    const r = (x.raw && typeof x.raw === 'object') ? (x.raw as Record<string, unknown>) : {};
    return pick(r, ['index', 'order', 'sequence', 'position', 'stopIndex']) !== undefined;
  });
  if (hasExplicitOrder) {
    indexed.sort((a, b) => a.idx - b.idx || a.fallbackIdx - b.fallbackIdx);
  }
  const adapted = indexed
    .map((x) => adaptStop(x.raw))
    .filter((s): s is Stop => s !== null);
  // Syncromatics frequently emits consecutive duplicate entries per stop
  // (the route's stop list contains one entry per visit/waypoint). Collapse
  // consecutive duplicates by id so we get the actual ordered stop sequence.
  const deduped: Stop[] = [];
  for (const s of adapted) {
    const last = deduped[deduped.length - 1];
    if (!last || last.id !== s.id) deduped.push(s);
  }
  return deduped;
}

export type InternalRouteId = 'P2P_EXPRESS' | 'BAITY_HILL';

/**
 * Map a Syncromatics route to our internal route id by name.
 * Returns null if no match.
 */
export function syncroRouteIdToInternal(route: { name?: string; id?: string }): InternalRouteId | null {
  const name = (route.name || '').toLowerCase();
  if (/p2p|point\s*to\s*point/.test(name) && /express/.test(name)) return 'P2P_EXPRESS';
  if (/baity/.test(name)) return 'BAITY_HILL';
  // Fall back to id-based hints.
  const id = (route.id || '').toLowerCase();
  if (/p2p|express/.test(id) && !/baity/.test(id)) return 'P2P_EXPRESS';
  if (/baity/.test(id)) return 'BAITY_HILL';
  return null;
}

/**
 * Active vehicles per route. Syncromatics' `/portal/vehicles` returns all
 * fleet vehicles (including idle ones) without routeId, so we fan out across
 * `/portal/routes/{id}/vehicles`, which only returns currently active buses
 * on each route and lets us attach routeId/routeName to each.
 */
export async function fetchVehicles(routes: Route[]): Promise<Vehicle[]> {
  if (routes.length === 0) return [];
  const settled = await Promise.allSettled(
    routes.map(async (route) => {
      const payload = await getJson(
        `/portal/routes/${encodeURIComponent(route.id)}/vehicles`
      );
      return asArray(payload)
        .map((v) => adaptVehicle(v, route.id, route.name))
        .filter((v): v is Vehicle => v !== null);
    })
  );
  const failed = settled.filter((r) => r.status === 'rejected');
  if (failed.length > 0 && failed.length === settled.length) {
    const first = failed[0] as PromiseRejectedResult;
    throw first.reason instanceof Error
      ? first.reason
      : new SyncromaticsError(String(first.reason), 0);
  }
  failed.forEach((r, idx) =>
    console.warn(
      `Syncromatics: route ${routes[idx]?.id} (${routes[idx]?.name}) vehicles failed:`,
      (r as PromiseRejectedResult).reason
    )
  );
  return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

export async function fetchArrivals(
  stopId: string,
  count = 3,
  init?: RequestInit
): Promise<Arrival[]> {
  const payload = await getJson(
    `/portal/stops/${encodeURIComponent(stopId)}/arrivals?count=${count}`,
    init
  );
  return asArray(payload)
    .map((a) => adaptArrival(a, stopId))
    .filter((a): a is Arrival => a !== null)
    .sort((a, b) => a.minutesUntilArrival - b.minutesUntilArrival);
}

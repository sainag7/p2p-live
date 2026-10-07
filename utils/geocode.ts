import type { Coordinate, Destination } from '../types';
import { API } from './api';

interface GeocodeResult { id: string; place_name: string; coordinates: [number, number] }

/** Session-only successful results; movement changes the proximity key. */
export function createGeocodeClient({ fetchImpl = (...args: Parameters<typeof fetch>) => fetch(...args), now = () => Date.now(), maxEntries = 20, ttlMs = 300000 } = {}) {
  const cache = new Map<string, { at: number; results: Destination[] }>();
  const key = (query: string, near: Coordinate) => `${query.trim().toLowerCase()}|${near.lon.toFixed(2)},${near.lat.toFixed(2)}`;
  function cached(query: string, near: Coordinate): Destination[] | null {
    const id = key(query, near), hit = cache.get(id);
    if (!hit) return null;
    if (now() - hit.at >= ttlMs) { cache.delete(id); return null; }
    return hit.results;
  }
  async function search(query: string, near: Coordinate, signal: AbortSignal): Promise<Destination[]> {
    const existing = cached(query, near);
    if (existing) return existing;
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
    const response = await fetchImpl(`${API}/api/mapbox/geocode?q=${encodeURIComponent(query.trim())}&proximity=${near.lon},${near.lat}`, { signal: requestSignal });
    if (!response.ok) throw new Error(`Address search failed (${response.status})`);
    const data = await response.json() as { results?: GeocodeResult[] };
    requestSignal.throwIfAborted();
    const results = (data.results ?? []).map(r => ({ id: `addr-${r.id}`, name: r.place_name.split(',')[0], address: r.place_name, lon: r.coordinates[0], lat: r.coordinates[1] }));
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value!);
    cache.set(key(query, near), { at: now(), results });
    return results;
  }
  return { cached, search };
}

export const geocoder = createGeocodeClient();

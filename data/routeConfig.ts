/**
 * Runtime route configs: ordered stops + metadata per route.
 * Builders produce configs from either API stops or hardcoded fallback data.
 * Geometry is fetched separately via /api/mapbox/route.
 */

import type { Stop } from '../types';
import {
  P2P_EXPRESS_STOPS,
  BAITY_HILL_STOPS,
  STOP_NAME_ALIASES,
  normalizeStopName,
  type P2PStop,
  type RouteId,
} from './p2pStops';

export const ROUTE_COLORS: Record<RouteId, string> = {
  P2P_EXPRESS: '#418FC5',
  BAITY_HILL: '#C33934',
};

export interface RouteStopConfig {
  id: string;
  name: string;
  coord: [number, number]; // [lng, lat]
  index: number;
  syncroStopId?: string;
}

export interface RouteConfig {
  routeId: RouteId;
  routeName: string;
  routeColor: string;
  stops: RouteStopConfig[];
}

const SIGNIFICANT_TOKEN_MIN_LEN = 3;
const STOPWORDS = new Set(['the', 'and', 'at', 'of', 'on', 'in', 'for', 'to', 'st', 'rd', 'ave']);

function significantTokens(normalized: string): Set<string> {
  return new Set(
    normalized
      .split(' ')
      .filter((t) => t.length >= SIGNIFICANT_TOKEN_MIN_LEN && !STOPWORDS.has(t))
  );
}

/** Try to match an API stop to one of our hardcoded entries by name. */
function matchHardcodedByName(
  apiStop: Stop,
  candidates: P2PStop[]
): P2PStop | null {
  const apiNorm = STOP_NAME_ALIASES[normalizeStopName(apiStop.name)] ?? normalizeStopName(apiStop.name);
  for (const c of candidates) {
    if ((STOP_NAME_ALIASES[normalizeStopName(c.name)] ?? normalizeStopName(c.name)) === apiNorm) {
      return c;
    }
  }
  // Token-overlap fallback (>= 2 shared significant tokens).
  const apiTokens = significantTokens(apiNorm);
  let best: { stop: P2PStop; overlap: number } | null = null;
  for (const c of candidates) {
    const cNorm = STOP_NAME_ALIASES[normalizeStopName(c.name)] ?? normalizeStopName(c.name);
    const cTokens = significantTokens(cNorm);
    let overlap = 0;
    for (const t of apiTokens) if (cTokens.has(t)) overlap++;
    if (overlap >= 2 && (!best || overlap > best.overlap)) {
      best = { stop: c, overlap };
    }
  }
  return best ? best.stop : null;
}

/**
 * Build a route config from API-ordered stops, assigning canonical internal
 * ids by matching against the hardcoded ordering for the same route. The API
 * stop id is preserved as `syncroStopId` so arrivals lookups still work.
 */
export function buildRouteConfigFromApiStops(
  routeId: RouteId,
  routeName: string,
  apiStops: Stop[],
  hardcodedOrdering: P2PStop[]
): RouteConfig {
  const usedHardcodedIds = new Set<string>();
  const unmatched: string[] = [];
  const stops: RouteStopConfig[] = apiStops.map((api, i) => {
    const remaining = hardcodedOrdering.filter((h) => !usedHardcodedIds.has(h.id));
    const match = matchHardcodedByName(api, remaining);
    const canonicalId = match ? match.id : `${routeId.toLowerCase()}-api-${i}`;
    if (match) usedHardcodedIds.add(match.id);
    else unmatched.push(api.name);
    return {
      id: canonicalId,
      name: api.name,
      coord: [api.lon, api.lat],
      index: i,
      syncroStopId: api.id,
    };
  });
  if (unmatched.length > 0 && typeof console !== 'undefined') {
    console.warn(`[routeConfig] ${routeId}: ${unmatched.length} API stop(s) unmatched to hardcoded ids:`, unmatched);
  }
  return { routeId, routeName, routeColor: ROUTE_COLORS[routeId], stops };
}

/**
 * Build a route config from hardcoded ordering, optionally upgrading lat/lon
 * from the global API `/portal/stops` payload by name match.
 */
export function buildRouteConfigFromHardcoded(
  routeId: RouteId,
  routeName: string,
  hardcoded: P2PStop[],
  apiStopsByNormalizedName?: Map<string, Stop>
): RouteConfig {
  const stops: RouteStopConfig[] = hardcoded
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((h, i) => {
      let lat = h.lat;
      let lon = h.lon;
      let syncroStopId: string | undefined;
      if (apiStopsByNormalizedName) {
        const key = STOP_NAME_ALIASES[normalizeStopName(h.name)] ?? normalizeStopName(h.name);
        const apiHit = apiStopsByNormalizedName.get(key);
        if (apiHit) {
          lat = apiHit.lat;
          lon = apiHit.lon;
          syncroStopId = apiHit.id;
        }
      }
      return {
        id: h.id,
        name: h.name,
        coord: [lon, lat],
        index: i,
        syncroStopId,
      };
    });
  return { routeId, routeName, routeColor: ROUTE_COLORS[routeId], stops };
}

/** Hardcoded last-resort fallback: identical to the pre-migration static configs. */
export const FALLBACK_ROUTE_CONFIGS: RouteConfig[] = [
  buildRouteConfigFromHardcoded('P2P_EXPRESS', 'P2P Express', P2P_EXPRESS_STOPS),
  buildRouteConfigFromHardcoded('BAITY_HILL', 'Baity Hill', BAITY_HILL_STOPS),
];

/** Lookup hardcoded ordering by internal route id. Used by builders/hooks. */
export const HARDCODED_ORDERING_BY_ROUTE: Record<RouteId, P2PStop[]> = {
  P2P_EXPRESS: P2P_EXPRESS_STOPS,
  BAITY_HILL: BAITY_HILL_STOPS,
};

/** Display name lookup. */
export const ROUTE_DISPLAY_NAMES: Record<RouteId, string> = {
  P2P_EXPRESS: 'P2P Express',
  BAITY_HILL: 'Baity Hill',
};

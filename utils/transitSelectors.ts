/**
 * Pure lookups over the transit network and the latest live snapshot.
 * "Active pattern" = the variant buses are running now, else the route's default.
 */

import type { LiveSnapshot, NetworkRoute, RouteId, RoutePattern, Stop, TransitNetwork } from '../types';
import { ROUTE_IDS } from '../data/routes';

const stopIndexCache = new WeakMap<TransitNetwork, Map<string, Stop>>();

function stopIndex(network: TransitNetwork): Map<string, Stop> {
  let index = stopIndexCache.get(network);
  if (!index) {
    index = new Map(network.stops.map((s) => [s.id, s]));
    stopIndexCache.set(network, index);
  }
  return index;
}

export function getRoute(network: TransitNetwork | null, routeId: RouteId): NetworkRoute | null {
  return network?.routes.find((r) => r.id === routeId) ?? null;
}

export function getPattern(network: TransitNetwork | null, patternId: number | null | undefined): RoutePattern | null {
  if (!network || patternId == null) return null;
  for (const route of network.routes) {
    const pattern = route.patterns.find((p) => p.id === patternId);
    if (pattern) return pattern;
  }
  return null;
}

export function getActivePattern(
  network: TransitNetwork | null,
  snapshot: LiveSnapshot | null,
  routeId: RouteId
): RoutePattern | null {
  const route = getRoute(network, routeId);
  if (!route) return null;
  const activeId = snapshot?.activePatternIds?.[routeId];
  return (
    route.patterns.find((p) => p.id === activeId) ??
    route.patterns.find((p) => p.id === route.defaultPatternId) ??
    route.patterns[0] ??
    null
  );
}

export function getStopById(network: TransitNetwork | null, stopId: string): Stop | null {
  return network ? stopIndex(network).get(stopId) ?? null : null;
}

export function getRouteStops(network: TransitNetwork | null, snapshot: LiveSnapshot | null, routeId: RouteId): Stop[] {
  const pattern = getActivePattern(network, snapshot, routeId);
  if (!network || !pattern) return [];
  const index = stopIndex(network);
  const seen = new Set<string>();
  const out: Stop[] = [];
  for (const ps of pattern.stops) {
    const stop = index.get(ps.stopId);
    if (!stop || seen.has(ps.stopId)) continue;
    seen.add(ps.stopId);
    out.push(stop);
  }
  return out;
}

export function getActiveStops(network: TransitNetwork | null, snapshot: LiveSnapshot | null): Stop[] {
  const seen = new Set<string>();
  const out: Stop[] = [];
  for (const routeId of ROUTE_IDS) {
    for (const stop of getRouteStops(network, snapshot, routeId)) {
      if (seen.has(stop.id)) continue;
      seen.add(stop.id);
      out.push(stop);
    }
  }
  return out;
}

export function getRoutesServingStop(
  network: TransitNetwork | null,
  snapshot: LiveSnapshot | null,
  stopId: string
): RouteId[] {
  return ROUTE_IDS.filter((routeId) =>
    getActivePattern(network, snapshot, routeId)?.stops.some((ps) => ps.stopId === stopId)
  );
}

/** Stable memo key for "which patterns are active", so memos don't rerun on every poll. */
export function activePatternKey(snapshot: LiveSnapshot | null): string {
  if (!snapshot) return '';
  return Object.entries(snapshot.activePatternIds)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([routeId, patternId]) => `${routeId}:${patternId}`)
    .join('|');
}

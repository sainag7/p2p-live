import type { LiveSnapshot, TransitNetwork } from '../types';
import { API } from './api';
import { canonicalStopId, displayStopName, MERGED_STOP_IDS } from '../data/stopDisplayNames';

export function withDisplayNames(network: TransitNetwork): TransitNetwork {
  return { ...network, stops: network.stops.map((s) => ({ ...s, name: displayStopName(s.id, s.name) })) };
}

/** One stop per physical stop: drop the merged-away duplicates and point patterns at the kept id. */
export function mergeNetworkStops(network: TransitNetwork): TransitNetwork {
  return {
    ...network,
    stops: network.stops.filter((s) => !(s.id in MERGED_STOP_IDS)),
    routes: network.routes.map((route) => ({
      ...route,
      patterns: route.patterns.map((p) => ({ ...p, stops: p.stops.map((ps) => ({ ...ps, stopId: canonicalStopId(ps.stopId) })) })),
    })),
  };
}

/** Same for live data: arrivals, vehicle stops and messages use the kept stop id. */
export function mergeSnapshotStops(snapshot: LiveSnapshot): LiveSnapshot {
  const arrivalsByStop: LiveSnapshot['arrivalsByStop'] = {};
  for (const [stopId, arrivals] of Object.entries(snapshot.arrivalsByStop)) {
    const id = canonicalStopId(stopId);
    arrivalsByStop[id] = [...(arrivalsByStop[id] ?? []), ...arrivals].sort((a, b) => a.etaSec - b.etaSec);
  }
  return {
    ...snapshot,
    arrivalsByStop,
    vehicles: snapshot.vehicles.map((v) => ({
      ...v,
      nextStopId: v.nextStopId && canonicalStopId(v.nextStopId),
      upcomingStops: v.upcomingStops.map((u) => ({ ...u, stopId: canonicalStopId(u.stopId) })),
    })),
    messages: snapshot.messages.map((m) => ({ ...m, stopIds: [...new Set(m.stopIds.map(canonicalStopId))] })),
  };
}

export async function fetchNetwork(signal?: AbortSignal): Promise<TransitNetwork> {
  const res = await fetch(`${API}/api/live/network`, { signal: signal ?? AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Transit network request failed (${res.status})`);
  return mergeNetworkStops(withDisplayNames((await res.json()) as TransitNetwork));
}

export async function fetchSnapshot(signal?: AbortSignal): Promise<LiveSnapshot> {
  const res = await fetch(`${API}/api/live/snapshot`, { signal: signal ?? AbortSignal.timeout(15000), cache: 'no-store' });
  if (!res.ok) throw new Error(`Live snapshot request failed (${res.status})`);
  return mergeSnapshotStops((await res.json()) as LiveSnapshot);
}

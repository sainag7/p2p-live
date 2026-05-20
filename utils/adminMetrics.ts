import type { Coordinate, Stop, Vehicle } from '../types';
import { getDistanceMeters } from './geo';

const CAMPUS_BBOX = { west: -79.08, south: 35.89, east: -79.03, north: 35.93 };
const CACHE_KEY = 'p2p-admin-metrics-v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

type RouteId = 'P2P_EXPRESS' | 'BAITY_HILL';

export interface AdminMetrics {
  generatedAt: number;
  system: {
    apiLatencyAvgMs: number | null;
    apiLatencyP95Ms: number | null;
    mapboxRouteLatencyAvgMs: number | null;
    mapboxRouteLatencyP95Ms: number | null;
  };
  routes: Record<
    RouteId,
    {
      distanceMeters: number | null;
      durationSec: number | null;
      loopDurationMin: number | null;
      efficiencyScore: number | null; // 0–100, 100 = optimal
      activeBuses: number;
      headwayMin: number | null;
      averageWaitMin: number | null; // half headway
      averageFullnessPercent: number | null;
      etaAccuracyPercent: number | null;
      gpsDropoutsToday: number | null;
      trackerFreezesToday: number | null;
    }
  >;
  optimization: {
    averageWalkTimeMin: number | null;
    averageWaitTimeMin: number | null;
    mostCongestedStopName: string | null;
    mostUnderutilizedStopName: string | null;
  };
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

async function timeFetch(url: string, init?: RequestInit, samples = 3): Promise<{ avg: number | null; p95: number | null }> {
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    const res = await fetch(url, init);
    // Consume body so timing includes full response read.
    try {
      await res.text();
    } catch {
      /* ignore */
    }
    const end = performance.now();
    if (res.ok) times.push(end - start);
  }
  const avg = times.length ? times.reduce((s, v) => s + v, 0) / times.length : null;
  const p95 = percentile(times, 0.95);
  return { avg: avg != null ? Math.round(avg) : null, p95: p95 != null ? Math.round(p95) : null };
}

function toRouteIdFromVehicle(vehicle: Vehicle): RouteId | null {
  const name = (vehicle.routeName || '').toLowerCase();
  if (name.includes('express')) return 'P2P_EXPRESS';
  if (name.includes('baity')) return 'BAITY_HILL';
  return null;
}

function mockFullnessPercent(vehicle: Vehicle): number {
  const key = `${vehicle.id}-${vehicle.routeId}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const base = (Math.abs(hash) % 1000) / 1000;
  const percent = 30 + base * 50; // 30–80
  return Math.round(percent);
}

async function fetchRouteInfo(routeId: RouteId): Promise<{ distanceMeters: number | null; durationSec: number | null }> {
  const res = await fetch(`/api/mapbox/route?routeId=${encodeURIComponent(routeId)}`);
  if (!res.ok) return { distanceMeters: null, durationSec: null };
  const data = await res.json();
  return {
    distanceMeters: typeof data?.distanceMeters === 'number' ? data.distanceMeters : null,
    durationSec: typeof data?.durationSec === 'number' ? data.durationSec : null,
  };
}

async function fetchWalkDurationSec(from: Coordinate, to: Coordinate): Promise<number | null> {
  const fromStr = `${from.lon},${from.lat}`;
  const toStr = `${to.lon},${to.lat}`;
  const res = await fetch(`/api/mapbox/directions/walk?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return typeof data?.durationSec === 'number' ? data.durationSec : null;
}

function randomCampusPoints(count: number, seed: number): Coordinate[] {
  const rand = mulberry32(seed);
  const pts: Coordinate[] = [];
  for (let i = 0; i < count; i++) {
    const lon = CAMPUS_BBOX.west + rand() * (CAMPUS_BBOX.east - CAMPUS_BBOX.west);
    const lat = CAMPUS_BBOX.south + rand() * (CAMPUS_BBOX.north - CAMPUS_BBOX.south);
    pts.push({ lat, lon });
  }
  return pts;
}

export function getCachedAdminMetrics(): AdminMetrics | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminMetrics;
    if (!parsed?.generatedAt) return null;
    if (Date.now() - parsed.generatedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setCachedAdminMetrics(metrics: AdminMetrics) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(metrics));
  } catch {
    /* ignore */
  }
}

export async function computeAdminMetrics(input: {
  stops: Stop[];
  vehicles: Vehicle[];
  complaints?: Array<{ route?: string; category?: string; notes?: string }>;
}): Promise<AdminMetrics> {
  const { stops, vehicles, complaints = [] } = input;

  const [apiLatency, routeLatency, expressInfo, baityInfo] = await Promise.all([
    timeFetch('/healthz', undefined, 3),
    timeFetch('/api/mapbox/route?routeId=P2P_EXPRESS', undefined, 2),
    fetchRouteInfo('P2P_EXPRESS'),
    fetchRouteInfo('BAITY_HILL'),
  ]);

  const routeInfos: Record<RouteId, { distanceMeters: number | null; durationSec: number | null }> = {
    P2P_EXPRESS: expressInfo,
    BAITY_HILL: baityInfo,
  };

  const activeBusCounts: Record<RouteId, number> = { P2P_EXPRESS: 0, BAITY_HILL: 0 };
  const fullnessBuckets: Record<RouteId, number[]> = { P2P_EXPRESS: [], BAITY_HILL: [] };

  vehicles.forEach((v) => {
    const rid = toRouteIdFromVehicle(v);
    if (!rid) return;
    activeBusCounts[rid] += 1;
    fullnessBuckets[rid].push(mockFullnessPercent(v));
  });

  const countIssues = (routeLabel: string | null) => {
    const subset = routeLabel
      ? complaints.filter((c) => (c.route || '').toLowerCase().includes(routeLabel.toLowerCase()))
      : complaints;
    const gps = subset.filter((c) => `${c.category ?? ''} ${c.notes ?? ''}`.toLowerCase().includes('gps')).length;
    const freeze = subset.filter((c) => `${c.category ?? ''} ${c.notes ?? ''}`.toLowerCase().includes('freeze')).length;
    return { gps, freeze };
  };
  const expressIssues = countIssues('P2P Express');
  const baityIssues = countIssues('Baity Hill');

  // Walk-time sampling: random campus points → nearest stop → Mapbox walking.
  const samplePoints = randomCampusPoints(8, 1337);
  const nearestCounts: Record<string, number> = {};
  const walkDurationsMin: number[] = [];

  for (const p of samplePoints) {
    let nearest: Stop | null = null;
    let best = Infinity;
    for (const s of stops) {
      const d = getDistanceMeters(p, s);
      if (d < best) {
        best = d;
        nearest = s;
      }
    }
    if (!nearest) continue;
    nearestCounts[nearest.id] = (nearestCounts[nearest.id] || 0) + 1;
    const durSec = await fetchWalkDurationSec(p, { lat: nearest.lat, lon: nearest.lon });
    if (durSec != null && durSec > 0) {
      walkDurationsMin.push(durSec / 60);
    } else {
      // fallback: straight-line walk time at 1.4 m/s
      walkDurationsMin.push(best / 1.4 / 60);
    }
  }

  let mostCongestedStopName: string | null = null;
  let mostUnderutilizedStopName: string | null = null;
  const nearestEntries = Object.entries(nearestCounts);
  if (nearestEntries.length) {
    nearestEntries.sort((a, b) => b[1] - a[1]);
    const topId = nearestEntries[0][0];
    const bottomId = nearestEntries[nearestEntries.length - 1][0];
    mostCongestedStopName = stops.find((s) => s.id === topId)?.name ?? null;
    mostUnderutilizedStopName = stops.find((s) => s.id === bottomId)?.name ?? null;
  }

  const avgWalk = walkDurationsMin.length ? walkDurationsMin.reduce((s, v) => s + v, 0) / walkDurationsMin.length : null;

  const routes: AdminMetrics['routes'] = {
    P2P_EXPRESS: {
      distanceMeters: routeInfos.P2P_EXPRESS.distanceMeters,
      durationSec: routeInfos.P2P_EXPRESS.durationSec,
      loopDurationMin: routeInfos.P2P_EXPRESS.durationSec != null ? routeInfos.P2P_EXPRESS.durationSec / 60 : null,
      efficiencyScore:
        routeInfos.P2P_EXPRESS.distanceMeters != null && routeInfos.P2P_EXPRESS.durationSec != null && routeInfos.P2P_EXPRESS.durationSec > 0
          ? Math.min(
              100,
              Math.round(
                ((routeInfos.P2P_EXPRESS.distanceMeters / 8.9408) / routeInfos.P2P_EXPRESS.durationSec) * 100
              )
            )
          : null,
      activeBuses: activeBusCounts.P2P_EXPRESS,
      headwayMin:
        routeInfos.P2P_EXPRESS.durationSec != null && activeBusCounts.P2P_EXPRESS > 0
          ? routeInfos.P2P_EXPRESS.durationSec / 60 / activeBusCounts.P2P_EXPRESS
          : null,
      averageWaitMin:
        routeInfos.P2P_EXPRESS.durationSec != null && activeBusCounts.P2P_EXPRESS > 0
          ? (routeInfos.P2P_EXPRESS.durationSec / 60 / activeBusCounts.P2P_EXPRESS) / 2
          : null,
      averageFullnessPercent:
        fullnessBuckets.P2P_EXPRESS.length
          ? Math.round(fullnessBuckets.P2P_EXPRESS.reduce((s, v) => s + v, 0) / fullnessBuckets.P2P_EXPRESS.length)
          : null,
      etaAccuracyPercent: null,
      gpsDropoutsToday: expressIssues.gps,
      trackerFreezesToday: expressIssues.freeze,
    },
    BAITY_HILL: {
      distanceMeters: routeInfos.BAITY_HILL.distanceMeters,
      durationSec: routeInfos.BAITY_HILL.durationSec,
      loopDurationMin: routeInfos.BAITY_HILL.durationSec != null ? routeInfos.BAITY_HILL.durationSec / 60 : null,
      efficiencyScore:
        routeInfos.BAITY_HILL.distanceMeters != null && routeInfos.BAITY_HILL.durationSec != null && routeInfos.BAITY_HILL.durationSec > 0
          ? Math.min(
              100,
              Math.round(
                ((routeInfos.BAITY_HILL.distanceMeters / 8.9408) / routeInfos.BAITY_HILL.durationSec) * 100
              )
            )
          : null,
      activeBuses: activeBusCounts.BAITY_HILL,
      headwayMin:
        routeInfos.BAITY_HILL.durationSec != null && activeBusCounts.BAITY_HILL > 0
          ? routeInfos.BAITY_HILL.durationSec / 60 / activeBusCounts.BAITY_HILL
          : null,
      averageWaitMin:
        routeInfos.BAITY_HILL.durationSec != null && activeBusCounts.BAITY_HILL > 0
          ? (routeInfos.BAITY_HILL.durationSec / 60 / activeBusCounts.BAITY_HILL) / 2
          : null,
      averageFullnessPercent:
        fullnessBuckets.BAITY_HILL.length
          ? Math.round(fullnessBuckets.BAITY_HILL.reduce((s, v) => s + v, 0) / fullnessBuckets.BAITY_HILL.length)
          : null,
      etaAccuracyPercent: null,
      gpsDropoutsToday: baityIssues.gps,
      trackerFreezesToday: baityIssues.freeze,
    },
  };

  const waitVals = [routes.P2P_EXPRESS.averageWaitMin, routes.BAITY_HILL.averageWaitMin].filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v)
  );
  const avgWait = waitVals.length ? waitVals.reduce((s, v) => s + v, 0) / waitVals.length : null;

  return {
    generatedAt: Date.now(),
    system: {
      apiLatencyAvgMs: apiLatency.avg,
      apiLatencyP95Ms: apiLatency.p95,
      mapboxRouteLatencyAvgMs: routeLatency.avg,
      mapboxRouteLatencyP95Ms: routeLatency.p95,
    },
    routes,
    optimization: {
      averageWalkTimeMin: avgWalk != null ? Math.round(avgWalk * 10) / 10 : null,
      averageWaitTimeMin: avgWait != null ? Math.round(avgWait * 10) / 10 : null,
      mostCongestedStopName,
      mostUnderutilizedStopName,
    },
  };
}


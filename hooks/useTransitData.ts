import { useCallback, useEffect, useRef, useState } from 'react';
import type { Stop, Vehicle, Route } from '../types';
import {
  fetchRoutes,
  fetchStops,
  fetchVehicles,
  fetchRouteStops,
  syncroRouteIdToInternal,
  SyncromaticsError,
  type InternalRouteId,
} from '../utils/syncromatics';
import {
  buildRouteConfigFromApiStops,
  buildRouteConfigFromHardcoded,
  FALLBACK_ROUTE_CONFIGS,
  HARDCODED_ORDERING_BY_ROUTE,
  type RouteConfig,
} from '../data/routeConfig';
import {
  normalizeStopName,
  STOP_NAME_ALIASES,
  STOPS,
} from '../data/p2pStops';

const INTERNAL_ROUTES: { id: InternalRouteId; name: string }[] = [
  { id: 'P2P_EXPRESS', name: 'P2P Express' },
  { id: 'BAITY_HILL', name: 'Baity Hill' },
];

interface TransitDataState {
  vehicles: Vehicle[];
  stops: Stop[];
  routes: Route[];
  routeConfigs: RouteConfig[];
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  refresh: () => Promise<void>;
}

function buildApiStopsByName(apiStops: Stop[]): Map<string, Stop> {
  const m = new Map<string, Stop>();
  for (const s of apiStops) {
    const key = STOP_NAME_ALIASES[normalizeStopName(s.name)] ?? normalizeStopName(s.name);
    if (!m.has(key)) m.set(key, s);
  }
  return m;
}

export function useTransitData(): TransitDataState {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeConfigs, setRouteConfigs] = useState<RouteConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const routesRef = useRef<Route[]>([]);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchVehicles(routesRef.current);
      setVehicles(next);
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      const msg =
        err instanceof SyncromaticsError
          ? err.message
          : err instanceof Error
          ? err.message
          : 'Failed to refresh vehicles';
      setError(msg);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Fetch the two top-level lists in parallel; tolerate each independently.
      const [routesSettled, stopsSettled] = await Promise.allSettled([
        fetchRoutes(),
        fetchStops(),
      ]).then((arr) => arr as [PromiseSettledResult<Route[]>, PromiseSettledResult<Stop[]>]);

      if (cancelled) return;

      const routesRes = routesSettled.status === 'fulfilled' ? routesSettled.value : [];
      const stopsRes = stopsSettled.status === 'fulfilled' ? stopsSettled.value : [];

      // Resolve internal → Syncromatics route ids by name match.
      const syncroByInternal = new Map<InternalRouteId, Route>();
      for (const r of routesRes) {
        const internal = syncroRouteIdToInternal(r);
        if (internal && !syncroByInternal.has(internal)) {
          syncroByInternal.set(internal, r);
        }
      }

      // Per-route ordered stops from API (best-effort, parallel, independent failure).
      const perRouteSettled = await Promise.allSettled(
        INTERNAL_ROUTES.map(async ({ id }) => {
          const syncro = syncroByInternal.get(id);
          if (!syncro) throw new Error(`no syncromatics route matched for ${id}`);
          const apiOrdered = await fetchRouteStops(syncro.id);
          return { id, apiOrdered };
        })
      );

      if (cancelled) return;

      const apiStopsByName = buildApiStopsByName(stopsRes);

      const nextConfigs: RouteConfig[] = INTERNAL_ROUTES.map(({ id, name }) => {
        const settled = perRouteSettled[INTERNAL_ROUTES.findIndex((r) => r.id === id)];
        if (settled && settled.status === 'fulfilled' && settled.value.apiOrdered.length > 0) {
          return buildRouteConfigFromApiStops(
            id,
            name,
            settled.value.apiOrdered,
            HARDCODED_ORDERING_BY_ROUTE[id]
          );
        }
        // Fallback: hardcoded ordering, lat/lon upgraded from /portal/stops when matched.
        return buildRouteConfigFromHardcoded(
          id,
          name,
          HARDCODED_ORDERING_BY_ROUTE[id],
          apiStopsByName.size > 0 ? apiStopsByName : undefined
        );
      });

      // Decide global state.
      const stopsFailed = stopsSettled.status !== 'fulfilled';
      const routesFailed = routesSettled.status !== 'fulfilled';
      const perRouteAllFailed = perRouteSettled.every((r) => r.status === 'rejected');
      const fullFailure = stopsFailed && routesFailed && perRouteAllFailed;

      if (fullFailure) {
        setStops(STOPS);
        setRouteConfigs(FALLBACK_ROUTE_CONFIGS);
        setRoutes([]);
        routesRef.current = [];
        const firstErr = [stopsSettled, routesSettled, ...perRouteSettled].find(
          (r) => r.status === 'rejected'
        ) as PromiseRejectedResult | undefined;
        const msg =
          firstErr && firstErr.reason instanceof Error
            ? firstErr.reason.message
            : 'Failed to load transit data';
        setError(msg);
        setLoading(false);
        return;
      }

      setRoutes(routesRes);
      routesRef.current = routesRes;
      setStops(stopsRes.length > 0 ? stopsRes : STOPS);
      setRouteConfigs(nextConfigs);

      // Fetch vehicles now that routes are known. Failure non-fatal.
      try {
        const vehiclesRes = await fetchVehicles(routesRes);
        if (cancelled) return;
        setVehicles(vehiclesRes);
        setLastUpdated(Date.now());
        setError(null);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof SyncromaticsError
            ? err.message
            : err instanceof Error
            ? err.message
            : 'Failed to load vehicles';
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { vehicles, stops, routes, routeConfigs, loading, error, lastUpdated, refresh };
}

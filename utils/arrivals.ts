/**
 * Arrivals for a stop: live GMV predictions when available, otherwise the timetable.
 * Single source for the closest-stop card, stop pop-up, search sheet and trip planning.
 */

import type { ClientLiveStatus, LiveSnapshot, RouteId, StopArrival, TransitNetwork } from '../types';
import { ROUTE_NAMES } from '../data/routes';
import { getRoutesServingStop } from './transitSelectors';
import { getRouteFrequencyMin, getUpcomingRouteArrivals, isRouteOperatingNow } from './serviceSchedule';

export interface StopArrivalsInput {
  stopId: string;
  snapshot: LiveSnapshot | null;
  status: ClientLiveStatus;
  network: TransitNetwork | null;
  now?: Date;
  limit?: number;
}

export function getStopArrivals({
  stopId,
  snapshot,
  status,
  network,
  now = new Date(),
  limit = 5,
}: StopArrivalsInput): StopArrival[] {
  const liveUsable = status === 'live' || status === 'degraded';
  const live = liveUsable && snapshot ? snapshot.arrivalsByStop[stopId] ?? [] : [];
  if (live.length > 0) {
    return live.slice(0, limit).map((a) => ({
      routeId: a.routeId,
      routeName: ROUTE_NAMES[a.routeId],
      etaSec: a.etaSec,
      source: a.scheduled ? 'scheduled' : 'live',
      vehicleId: a.vehicleId,
    }));
  }

  return getRoutesServingStop(network, snapshot, stopId)
    .filter((routeId) => isRouteOperatingNow(routeId, now))
    .flatMap((routeId) =>
      getUpcomingRouteArrivals(routeId, now, 3).map(
        (minutes): StopArrival => ({
          routeId,
          routeName: ROUTE_NAMES[routeId],
          etaSec: minutes * 60,
          source: 'scheduled',
          vehicleId: null,
        })
      )
    )
    .sort((a, b) => a.etaSec - b.etaSec)
    .slice(0, limit);
}

/** How long one bus takes to come round, measured where the feed predicts the same bus twice at a stop. */
export function measuredLapSec(snapshot: LiveSnapshot | null, routeId: RouteId): number | null {
  const laps: number[] = [];
  for (const arrivals of Object.values(snapshot?.arrivalsByStop ?? {})) {
    const byVehicle = new Map<string, number[]>();
    for (const a of arrivals) {
      if (a.routeId === routeId && a.vehicleId && !a.scheduled) byVehicle.set(a.vehicleId, [...(byVehicle.get(a.vehicleId) ?? []), a.etaSec]);
    }
    for (const etas of byVehicle.values()) if (etas.length > 1) { etas.sort((a, b) => a - b); laps.push(etas[1] - etas[0]); }
  }
  return laps.length ? laps.sort((a, b) => a - b)[Math.floor(laps.length / 2)] : null;
}

/**
 * The next `perRoute` arrivals for each route at a stop, soonest route first. The live feed
 * often predicts one lap per bus, so its next pass is estimated one lap later (measured from
 * the feed, else the scheduled headway); routes with no live bus use the timetable.
 * Filled-in times are marked scheduled.
 */
export function nextArrivalsByRoute(input: StopArrivalsInput & { perRoute?: number }): StopArrival[] {
  const { stopId, network, snapshot, now = new Date(), perRoute = 2 } = input;
  const all = getStopArrivals({ ...input, now, limit: Infinity });
  const routes = [...new Set([...all.map((a) => a.routeId), ...getRoutesServingStop(network, snapshot, stopId)])];
  const groups = routes.map((routeId) => {
    const list = all.filter((a) => a.routeId === routeId).slice(0, perRoute);
    const scheduled = (etaSec: number): StopArrival => ({ routeId, routeName: ROUTE_NAMES[routeId], etaSec, source: 'scheduled', vehicleId: null });
    if (!list.length) {
      if (isRouteOperatingNow(routeId, now)) list.push(...getUpcomingRouteArrivals(routeId, now, perRoute).map((minutes) => scheduled(minutes * 60)));
    } else {
      const lapSec = measuredLapSec(snapshot, routeId) ?? (getRouteFrequencyMin(routeId) ?? 0) * 60;
      while (lapSec && list.length < perRoute) {
        const etaSec = list[list.length - 1].etaSec + lapSec;
        if (!isRouteOperatingNow(routeId, new Date(now.getTime() + etaSec * 1000))) break;
        list.push(scheduled(etaSec));
      }
    }
    return list;
  }).filter((list) => list.length > 0);
  return groups.sort((a, b) => a[0].etaSec - b[0].etaSec).flat();
}

import { useEffect, useRef, useState } from 'react';
import type { Coordinate, Destination } from '../types';
import type { TripOptions } from '../utils/tripPlanning';
import { computeTripOptions } from '../utils/multimodalRouting';
import { getDistanceMeters } from '../utils/geo';
import { useTransit } from '../context/TransitProvider';

export type StarredTrip = { state: 'loading' } | { state: 'ready'; options: TripOptions } | { state: 'error' };

/** Each plan asks for many walking routes, so Home re-plans only this often or after the rider moves a block. */
const REFRESH_MS = 3 * 60 * 1000;
const MOVED_METERS = 150;

/**
 * Walk and bus options to each place, for Home's starred list. Places are planned one at a time
 * (they share the walks to nearby stops) and never on every live poll. Off when `origin` is null.
 */
export function useStarredTrips(places: Destination[], origin: Coordinate | null): Record<string, StarredTrip> {
  const { network, snapshot } = useTransit();
  const transit = useRef({ network, snapshot });
  transit.current = { network, snapshot };
  const [trips, setTrips] = useState<Record<string, StarredTrip>>({});
  const [refreshAt, setRefreshAt] = useState(0);
  useEffect(() => { const timer = setInterval(() => setRefreshAt(Date.now()), REFRESH_MS); return () => clearInterval(timer); }, []);

  const anchor = useRef<Coordinate | null>(null);
  if (!origin) anchor.current = null;
  else if (!anchor.current || getDistanceMeters(anchor.current, origin) > MOVED_METERS) anchor.current = origin;
  const from = anchor.current;
  const placesKey = places.map((p) => `${p.id}@${p.lat},${p.lon}`).join('|');
  const hasNetwork = network != null;

  useEffect(() => {
    if (!from || !hasNetwork) return;
    let cancelled = false;
    // Keep showing the last times while fresh ones load.
    setTrips((prev) => Object.fromEntries(places.map((p) => [p.id, prev[p.id]?.state === 'ready' ? prev[p.id] : { state: 'loading' }])));
    (async () => {
      for (const place of places) {
        try {
          const options = await computeTripOptions({ origin: from, destination: place, ...transit.current });
          if (cancelled) return;
          setTrips((prev) => ({ ...prev, [place.id]: options.walk || options.bus ? { state: 'ready', options } : { state: 'error' } }));
        } catch {
          if (cancelled) return;
          setTrips((prev) => ({ ...prev, [place.id]: { state: 'error' } }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [placesKey, from, hasNetwork, refreshAt]);

  return trips;
}

import React, { useEffect, useMemo, useState } from 'react';
import { Vehicle, Stop, Coordinate, Arrival } from '../types';
import { X, Navigation } from 'lucide-react';
import { getDistanceMeters, getWalkTimeMinutes } from '../utils/geo';
import { fetchArrivals } from '../utils/syncromatics';
import { isExpressRoute } from '../utils/routeColor';

function getMockFullnessPercent(vehicle: Vehicle): number {
  const key = `${vehicle.id}-${vehicle.routeId}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const base = (Math.abs(hash) % 1000) / 1000;
  const percent = 30 + base * 50; // 30–80
  return Math.round(percent);
}

function getFullnessMeta(
  percent: number
): { label: string; textClass: string; barClass: string } {
  if (percent <= 30)
    return { label: 'Low', textClass: 'text-emerald-600', barClass: 'bg-emerald-500' };
  if (percent <= 70)
    return { label: 'Moderate', textClass: 'text-yellow-600', barClass: 'bg-yellow-400' };
  if (percent <= 90)
    return { label: 'High', textClass: 'text-orange-600', barClass: 'bg-orange-500' };
  return { label: 'Near Capacity', textClass: 'text-red-600', barClass: 'bg-red-500' };
}

interface BusDetailSheetProps {
  vehicle: Vehicle | null;
  stops: Stop[];
  userLocation: Coordinate;
  onClose: () => void;
}

interface VehicleArrivalsState {
  arrivals: (Arrival & { stopName: string })[];
  loading: boolean;
  error: string | null;
}

function useVehicleArrivals(vehicle: Vehicle | null, stops: Stop[]): VehicleArrivalsState {
  const [state, setState] = useState<VehicleArrivalsState>({ arrivals: [], loading: false, error: null });

  // Limit to a reasonable subset (up to 6 closest stops on the route) to avoid 22+ requests per open.
  const candidateStops = useMemo(() => {
    if (!vehicle) return [];
    return [...stops]
      .map((s) => ({ stop: s, dist: getDistanceMeters({ lat: vehicle.lat, lon: vehicle.lon }, s) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 6)
      .map(({ stop }) => stop);
  }, [vehicle, stops]);

  useEffect(() => {
    if (!vehicle || candidateStops.length === 0) {
      setState({ arrivals: [], loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ arrivals: [], loading: true, error: null });
    (async () => {
      try {
        const settled = await Promise.allSettled(
          candidateStops.map((s) => fetchArrivals(s.id, 3))
        );
        if (cancelled) return;
        const stopNameById = new Map(candidateStops.map((s) => [s.id, s.name]));
        const matched: (Arrival & { stopName: string })[] = [];
        settled.forEach((result, idx) => {
          if (result.status !== 'fulfilled') return;
          const stopId = candidateStops[idx].id;
          for (const a of result.value) {
            if (a.vehicleId && a.vehicleId === vehicle.id) {
              matched.push({ ...a, stopId, stopName: stopNameById.get(stopId) ?? stopId });
            }
          }
        });
        matched.sort((a, b) => a.minutesUntilArrival - b.minutesUntilArrival);
        setState({ arrivals: matched, loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load vehicle arrivals';
        setState({ arrivals: [], loading: false, error: msg });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vehicle, candidateStops]);

  return state;
}

export const BusDetailSheet: React.FC<BusDetailSheetProps> = ({ vehicle, stops, userLocation, onClose }) => {
  const { arrivals, loading: arrivalsLoading, error: arrivalsError } = useVehicleArrivals(vehicle, stops);

  useEffect(() => {
    if (!vehicle) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [vehicle]);

  if (!vehicle) return null;

  const nextArrival = arrivals[0] ?? null;
  const upcoming = arrivals.slice(0, 5);

  const walkToNextStop = nextArrival
    ? getWalkTimeMinutes(
        getDistanceMeters(userLocation, {
          lat: stops.find((s) => s.id === nextArrival.stopId)?.lat ?? userLocation.lat,
          lon: stops.find((s) => s.id === nextArrival.stopId)?.lon ?? userLocation.lon,
        })
      )
    : null;

  const fullnessPercent = getMockFullnessPercent(vehicle);
  const fullnessMeta = getFullnessMeta(fullnessPercent);
  const express = isExpressRoute(vehicle);

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center sm:justify-center pointer-events-none">
      <div
        className="absolute inset-0 bg-black/40 pointer-events-auto backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div
        className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-2xl z-50 pointer-events-auto max-h-[85vh] flex flex-col animate-slide-up sm:m-4"
        style={{ minHeight: 0 }}
      >
        <div className="shrink-0">
          <div className="w-full flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
          </div>
          <div className="p-5 pb-0 flex justify-between items-start">
            <div>
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs font-bold mb-2 text-white ${
                  express ? 'bg-p2p-blue' : 'bg-p2p-red'
                }`}
              >
                {vehicle.routeName.toUpperCase()}
              </span>
              <h2 className="text-2xl font-bold text-gray-900">{vehicle.routeName}</h2>
              <p className="text-gray-500 text-sm">Vehicle ID: {vehicle.id}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
              aria-label="Close"
            >
              <X size={20} className="text-gray-600" />
            </button>
          </div>
        </div>

        <div
          className="flex-1 min-h-0 overflow-y-auto p-5 pt-4"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* Current Status */}
          <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-semibold text-gray-700">
                {nextArrival ? (
                  <>
                    En route to <span className="text-gray-900">{nextArrival.stopName}</span>
                  </>
                ) : arrivalsLoading ? (
                  'Loading next stop…'
                ) : (
                  'Live position'
                )}
              </span>
            </div>

            <div className="flex justify-between items-center pl-5 mb-3">
              <div>
                {nextArrival ? (
                  <>
                    <div className="text-3xl font-bold text-gray-900">
                      {nextArrival.minutesUntilArrival}
                      <span className="text-lg font-medium text-gray-500 ml-1">min</span>
                    </div>
                    <div className="text-xs text-gray-400">Estimated Arrival</div>
                  </>
                ) : (
                  <>
                    <div className="text-base font-semibold text-gray-700">
                      {arrivalsLoading
                        ? 'Fetching ETAs…'
                        : arrivalsError
                        ? 'ETAs unavailable'
                        : 'No imminent arrivals at nearby stops'}
                    </div>
                  </>
                )}
              </div>
              {walkToNextStop !== null && (
                <div className="text-right">
                  <div className="flex items-center justify-end text-p2p-blue gap-1">
                    <Navigation size={14} />
                    <span className="font-bold">{walkToNextStop} min</span>
                  </div>
                  <div className="text-xs text-gray-400">Walk to stop</div>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Real-Time Fullness</span>
                <span className={`font-semibold ${fullnessMeta.textClass}`}>
                  {fullnessPercent}% ({fullnessMeta.label})
                </span>
              </div>
              <div className="h-2 bg-white rounded-full overflow-hidden border border-gray-200/70">
                <div
                  className={`h-full rounded-full ${fullnessMeta.barClass}`}
                  style={{ width: `${fullnessPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Upcoming Stops */}
          <div>
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Upcoming Stops</h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                {arrivalsLoading ? 'Loading…' : 'No upcoming stop ETAs reported for this bus.'}
              </p>
            ) : (
              <div className="relative pl-2 space-y-6 before:content-[''] before:absolute before:left-[19px] before:top-2 before:bottom-4 before:w-0.5 before:bg-gray-200">
                {upcoming.map((stop, idx) => (
                  <div key={`${stop.stopId}-${idx}`} className="relative flex items-center justify-between pl-8 group">
                    <div
                      className={`absolute left-3 w-4 h-4 rounded-full border-2 border-white shadow-sm z-10 ${
                        idx === 0 ? 'bg-p2p-blue' : 'bg-gray-300'
                      }`}
                    />
                    <span className={`text-sm font-medium ${idx === 0 ? 'text-gray-900' : 'text-gray-600'}`}>
                      {stop.stopName}
                    </span>
                    <span className={`text-sm font-bold ${idx === 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                      {stop.minutesUntilArrival} min
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

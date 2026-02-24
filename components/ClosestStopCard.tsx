import React, { useMemo } from 'react';
import { Stop, Vehicle, Coordinate } from '../types';
import { getDistanceMeters, getWalkTimeMinutes } from '../utils/geo';
import { ROUTE_CONFIGS } from '../data/routeConfig';
import { Navigation, Clock } from 'lucide-react';

interface ClosestStopCardProps {
  stop: Stop;
  userLocation: Coordinate;
  vehicles: Vehicle[];
}

export const ClosestStopCard: React.FC<ClosestStopCardProps> = ({ stop, userLocation, vehicles }) => {
  const walkTime = useMemo(() => {
    const dist = getDistanceMeters(userLocation, stop);
    return getWalkTimeMinutes(dist);
  }, [userLocation, stop]);

  const bestBus = useMemo(() => {
    let bestVehicle: Vehicle | null = null;
    let minEta = Infinity;

    vehicles.forEach(v => {
      const upcoming = v.upcomingStops.find(s => s.stopId === stop.id);
      if (upcoming && upcoming.etaMin < minEta) {
        minEta = upcoming.etaMin;
        bestVehicle = v;
      }
    });

    return { vehicle: bestVehicle, eta: minEta };
  }, [stop, vehicles]);

  const mockArrivals = useMemo(() => {
    const servingRoutes = ROUTE_CONFIGS.filter((route) =>
      route.stops.some((rs) => rs.id === stop.id)
    );
    if (servingRoutes.length === 0) {
      return [] as { routeName: string; minutes: number; color: string }[];
    }

    // Simple deterministic-ish RNG based on stop id and vehicle count
    const rng = (salt: number) => {
      const key = `${stop.id}-${vehicles.length}-${salt}`;
      let hash = 0;
      for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) | 0;
      }
      const base = (Math.abs(hash) % 1000) / 1000;
      return base; // 0..1
    };

    const primaryRoute =
      servingRoutes[Math.floor(rng(1) * servingRoutes.length) % servingRoutes.length];
    const firstMinutes = 2 + Math.floor(rng(2) * 11); // 2–12

    const arrivals: { routeName: string; minutes: number; color: string }[] = [
      { routeName: primaryRoute.routeName, minutes: firstMinutes, color: primaryRoute.routeColor },
    ];

    // Optional second arrival 10–18 minutes after the first
    if (rng(3) > 0.4) {
      const secondRoute =
        servingRoutes[Math.floor(rng(4) * servingRoutes.length) % servingRoutes.length];
      const secondMinutes = firstMinutes + 10 + Math.floor(rng(5) * 9); // +10–18
      arrivals.push({
        routeName: secondRoute.routeName,
        minutes: secondMinutes,
        color: secondRoute.routeColor,
      });
    }

    return arrivals;
  }, [stop.id, vehicles.length]);

  return (
    <div className="mt-3 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Closest Stop</h2>
          <h3 className="text-lg font-bold text-gray-900 leading-tight">{stop.name}</h3>
        </div>
        <div className="flex items-center text-p2p-blue bg-p2p-light-blue/20 px-2 py-1 rounded-lg">
          <Navigation size={14} className="mr-1" />
          <span className="text-sm font-bold">{walkTime} min walk</span>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-3">
        {bestBus.vehicle ? (
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900">
                {bestBus.vehicle.routeName}
              </span>
              <span className="text-xs text-gray-500">Approaching</span>
            </div>
            <div className="flex items-center text-p2p-red">
              <Clock size={16} className="mr-1.5" />
              <span className="font-bold text-lg">{bestBus.eta} min</span>
            </div>
          </div>
        ) : mockArrivals.length > 0 ? (
          <div className="space-y-2">
            {mockArrivals.map((arr, idx) => {
              const label =
                arr.minutes < 2 ? 'Arriving now' : `Arriving in ${arr.minutes} min`;
              return (
                <div
                  key={`${arr.routeName}-${idx}`}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold text-white"
                      style={{ backgroundColor: arr.color }}
                    >
                      {arr.routeName}
                    </span>
                    <span className="text-xs text-gray-500">Scheduled</span>
                  </div>
                  <span className="text-sm font-bold text-gray-900">{label}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <span className="text-sm text-gray-400 italic">No scheduled arrivals soon</span>
        )}
      </div>
    </div>
  );
};

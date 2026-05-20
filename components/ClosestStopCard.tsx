import React, { useMemo } from 'react';
import { Stop, Coordinate } from '../types';
import { getDistanceMeters, getWalkTimeMinutes } from '../utils/geo';
import { useArrivals } from '../hooks/useArrivals';
import { isExpressRoute } from '../utils/routeColor';
import { Navigation, Clock } from 'lucide-react';

interface ClosestStopCardProps {
  stop: Stop;
  userLocation: Coordinate;
}

export const ClosestStopCard: React.FC<ClosestStopCardProps> = ({ stop, userLocation }) => {
  const walkTime = useMemo(() => {
    const dist = getDistanceMeters(userLocation, stop);
    return getWalkTimeMinutes(dist);
  }, [userLocation, stop]);

  const { arrivals, loading, error } = useArrivals(stop.id);
  const upcoming = arrivals.slice(0, 2);

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
        {loading && upcoming.length === 0 ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-2/3" />
            <div className="h-3 bg-gray-200 rounded w-1/3" />
          </div>
        ) : upcoming.length > 0 ? (
          <div className="space-y-2">
            {upcoming.map((arr, idx) => {
              const label =
                arr.minutesUntilArrival < 1
                  ? 'Arriving now'
                  : `Arriving in ${arr.minutesUntilArrival} min`;
              const color = isExpressRoute({ routeName: arr.routeName }) ? '#418FC5' : '#C33934';
              return (
                <div
                  key={`${arr.vehicleId || arr.routeId}-${idx}`}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {arr.routeName || `Route ${arr.routeId}`}
                    </span>
                    <span className="text-xs text-gray-500">
                      {idx === 0 ? 'Approaching' : 'Next'}
                    </span>
                  </div>
                  <div className="flex items-center text-p2p-red">
                    <Clock size={16} className="mr-1.5" />
                    <span className="font-bold text-sm">{label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : error ? (
          <span className="text-sm text-gray-400 italic">ETAs unavailable</span>
        ) : (
          <span className="text-sm text-gray-400 italic">No upcoming arrivals</span>
        )}
      </div>
    </div>
  );
};

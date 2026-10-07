import React, { useMemo } from 'react';
import type { Stop, Coordinate } from '../types';
import { getDistanceMeters, getWalkTimeMinutes } from '../utils/geo';
import { Navigation } from 'lucide-react';
import { getServiceResumeLabel } from '../utils/serviceSchedule';
import { ROUTE_COLORS } from '../data/routes';
import { formatEta } from '../utils/format';
import { useStopArrivals } from '../context/TransitProvider';
import { ArrivalSourceTag } from './ArrivalSourceTag';

interface ClosestStopCardProps {
  stop: Stop;
  userLocation: Coordinate;
}

export const ClosestStopCard: React.FC<ClosestStopCardProps> = ({ stop, userLocation }) => {
  const walkTime = useMemo(() => getWalkTimeMinutes(getDistanceMeters(userLocation, stop)), [userLocation, stop]);
  const arrivals = useStopArrivals(stop.id, 3);

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
        {arrivals.length > 0 ? (
          <div className="space-y-2">
            {arrivals.map((arr, idx) => (
              <div key={`${arr.routeId}-${arr.vehicleId ?? 'sched'}-${idx}`} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold text-white"
                    style={{ backgroundColor: ROUTE_COLORS[arr.routeId] }}
                  >
                    {arr.routeName}
                  </span>
                  <ArrivalSourceTag source={arr.source} />
                </div>
                <span className="text-sm font-bold text-gray-900">
                  {arr.etaSec < 60 ? 'Arriving now' : `Arriving in ${formatEta(arr.etaSec)}`}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-sm text-gray-500 italic">Service resumes at {getServiceResumeLabel()}</span>
        )}
      </div>
    </div>
  );
};

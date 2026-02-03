import React, { useMemo } from 'react';
import { Stop, Vehicle, Coordinate } from '../types';
import { getDistanceMeters, getWalkTimeMinutes } from '../utils/geo';
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

  return (
    <div className="mx-4 mt-4 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
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

      <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
        {bestBus.vehicle ? (
          <>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900">{bestBus.vehicle.routeName}</span>
              <span className="text-xs text-gray-500">Approaching</span>
            </div>
            <div className="flex items-center text-p2p-red">
              <Clock size={16} className="mr-1.5" />
              <span className="font-bold text-lg">{bestBus.eta} min</span>
            </div>
          </>
        ) : (
          <span className="text-sm text-gray-400 italic">No scheduled arrivals soon</span>
        )}
      </div>
    </div>
  );
};

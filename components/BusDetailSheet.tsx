import React, { useMemo } from 'react';
import { Vehicle, Stop, Coordinate } from '../types';
import { X, MapPin, Navigation } from 'lucide-react';
import { getDistanceMeters, getWalkTimeMinutes } from '../utils/geo';

interface BusDetailSheetProps {
  vehicle: Vehicle | null;
  stops: Stop[];
  userLocation: Coordinate;
  onClose: () => void;
}

export const BusDetailSheet: React.FC<BusDetailSheetProps> = ({ vehicle, stops, userLocation, onClose }) => {
  if (!vehicle) return null;

  const getStopName = (id: string) => stops.find(s => s.id === id)?.name || id;
  const getStopObj = (id: string) => stops.find(s => s.id === id);

  const nextStop = getStopObj(vehicle.nextStopId);
  
  // Calculate walk time to the bus's NEXT immediate stop
  const walkToNextStop = useMemo(() => {
    if (!nextStop) return null;
    const dist = getDistanceMeters(userLocation, nextStop);
    return getWalkTimeMinutes(dist);
  }, [nextStop, userLocation]);

  return (
    <div className="absolute inset-0 z-40 flex items-end sm:items-center sm:justify-center pointer-events-none">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 pointer-events-auto backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-2xl z-50 pointer-events-auto max-h-[80vh] overflow-y-auto animate-slide-up sm:m-4">
        
        {/* Handle for mobile feeling */}
        <div className="w-full flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
        </div>

        <div className="p-5">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold mb-2 ${
                vehicle.routeId === 'p2p-express' ? 'bg-p2p-blue text-white' : 'bg-p2p-red text-white'
              }`}>
                {vehicle.routeId.toUpperCase().replace('-', ' ')}
              </span>
              <h2 className="text-2xl font-bold text-gray-900">{vehicle.routeName}</h2>
              <p className="text-gray-500 text-sm">Vehicle ID: {vehicle.id}</p>
            </div>
            <button 
              onClick={onClose}
              className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
            >
              <X size={20} className="text-gray-600" />
            </button>
          </div>

          {/* Current Status */}
          <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-semibold text-gray-700">En route to <span className="text-gray-900">{getStopName(vehicle.nextStopId)}</span></span>
            </div>
            
            <div className="flex justify-between items-center pl-5">
               <div>
                 <div className="text-3xl font-bold text-gray-900">{vehicle.nextStopEtaMin}<span className="text-lg font-medium text-gray-500 ml-1">min</span></div>
                 <div className="text-xs text-gray-400">Estimated Arrival</div>
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
          </div>

          {/* Upcoming Stops */}
          <div>
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Upcoming Stops</h3>
            <div className="relative pl-2 space-y-6 before:content-[''] before:absolute before:left-[19px] before:top-2 before:bottom-4 before:w-0.5 before:bg-gray-200">
              {vehicle.upcomingStops.map((stop, idx) => (
                <div key={`${stop.stopId}-${idx}`} className="relative flex items-center justify-between pl-8 group">
                  {/* Dot */}
                  <div className={`absolute left-3 w-4 h-4 rounded-full border-2 border-white shadow-sm z-10 ${idx === 0 ? 'bg-p2p-blue' : 'bg-gray-300'}`} />
                  
                  <span className={`text-sm font-medium ${idx === 0 ? 'text-gray-900' : 'text-gray-600'}`}>
                    {getStopName(stop.stopId)}
                  </span>
                  <span className={`text-sm font-bold ${idx === 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                    {stop.etaMin} min
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

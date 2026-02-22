import React, { useState, useCallback } from 'react';
import { MapboxMap } from './MapboxMap';
import { StopPlacementPanel, isStopPlacementModeEnabled, type CapturedPoint } from './StopPlacementPanel';
import { Stop, Vehicle, Coordinate, Journey } from '../types';
import { getDistanceMeters, getWalkTimeMinutes } from '../utils/geo';
import { Navigation, X } from 'lucide-react';

interface MapViewProps {
  stops: Stop[];
  vehicles: Vehicle[];
  userLocation: Coordinate;
  onSelectBus: (bus: Vehicle) => void;
  onSelectStop: (stop: Stop) => void;
  /** Called when user taps "Route to this stop"; navigates to Plan Trip with this stop as destination. */
  onRouteToStop?: (destination: { id: string; name: string; lat: number; lon: number }) => void;
  selectedStop: Stop | null;
  activeJourney?: Journey | null;
  onClearJourney?: () => void;
  /** When false, map will fly to user once when it becomes true (geolocation resolved). */
  userLocationResolved?: boolean;
}

export const MapView: React.FC<MapViewProps> = ({
  stops,
  vehicles,
  userLocation,
  onSelectBus,
  onSelectStop,
  onRouteToStop,
  selectedStop,
  activeJourney,
  onClearJourney,
  userLocationResolved = true,
}) => {
  const [enable3D, setEnable3D] = useState(true);
  const stopPlacementMode = isStopPlacementModeEnabled();
  const [placementPoints, setPlacementPoints] = useState<CapturedPoint[]>([]);

  const handleMapClick = useCallback((lng: number, lat: number) => {
    if (!stopPlacementMode) return;
    setPlacementPoints((prev) => [...prev, { lng, lat }]);
    const snippet = `{ lng: ${lng}, lat: ${lat} }`;
    console.log('Stop placement:', snippet);
    navigator.clipboard.writeText(snippet).catch(() => {});
  }, [stopPlacementMode]);

  const placementMarkers = placementPoints.map((p) => ({ lng: p.lng, lat: p.lat }));

  return (
    <div className="w-full h-full bg-gray-100 relative">
      <MapboxMap
        stops={stops}
        vehicles={vehicles}
        userLocation={userLocation}
        userLocationResolved={userLocationResolved}
        selectedStopId={selectedStop?.id ?? null}
        selectedBusId={null}
        activeJourney={activeJourney ?? null}
        onSelectBus={onSelectBus}
        onSelectStop={onSelectStop}
        enable3D={enable3D}
        onMapClick={stopPlacementMode ? handleMapClick : undefined}
        placementMarkers={stopPlacementMode ? placementMarkers : undefined}
        className="w-full h-full"
      />

      {stopPlacementMode && (
        <StopPlacementPanel
          points={placementPoints}
          onClear={() => setPlacementPoints([])}
          onRemove={(i) => setPlacementPoints((prev) => prev.filter((_, idx) => idx !== i))}
          onUpdatePoint={(i, u) =>
            setPlacementPoints((prev) =>
              prev.map((p, idx) => (idx === i ? { ...p, ...u } : p))
            )
          }
        />
      )}

      {/* 3D toggle — bottom-left, minimal */}
      <button
        type="button"
        onClick={() => setEnable3D((v) => !v)}
        className="absolute bottom-20 left-3 z-[400] px-2.5 py-1 bg-white rounded shadow border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 min-w-[2rem]"
        aria-label="Toggle 3D view"
        aria-pressed={enable3D}
      >
        3D
      </button>

      {/* Active Journey Overlay */}
      {activeJourney && (
        <div className="absolute top-4 left-4 right-4 z-[400] animate-in slide-in-from-top-4">
          <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-100 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase">Navigating to</div>
              <div className="font-bold text-gray-900">{activeJourney.destination.name}</div>
              <div className="text-xs text-p2p-blue font-semibold mt-1">
                {activeJourney.totalDurationMin} min • {activeJourney.segments.length} steps
              </div>
            </div>
            <button
              type="button"
              onClick={onClearJourney}
              className="p-2 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200"
              aria-label="Clear journey"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Selected Stop Overlay Card (only if no active journey covers it) */}
      {selectedStop && !activeJourney && (
        <div className="absolute top-20 left-4 right-4 bg-white p-4 rounded-xl shadow-lg border border-gray-100 z-[400] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-3">
            <div>
              <div className="text-xs font-bold text-gray-400 uppercase">Selected Stop</div>
              <div className="font-bold text-gray-900 text-lg">{selectedStop.name}</div>
            </div>
            <div className="flex items-center text-p2p-blue bg-p2p-light-blue/20 px-3 py-1.5 rounded-lg">
              <Navigation size={16} className="mr-1.5" />
              <span className="font-bold">
                {getWalkTimeMinutes(getDistanceMeters(userLocation, selectedStop))} min
              </span>
            </div>
          </div>
          {onRouteToStop && (
            <button
              type="button"
              onClick={() => onRouteToStop({ id: selectedStop.id, name: selectedStop.name, lat: selectedStop.lat, lon: selectedStop.lon })}
              className="w-full bg-p2p-blue text-white py-3 rounded-xl font-bold text-sm shadow-md active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <Navigation size={18} />
              Route to this stop
            </button>
          )}
        </div>
      )}

      {/* Attribution */}
      <div className="absolute bottom-6 right-2 bg-white/80 px-2 py-0.5 text-[10px] rounded text-gray-500 z-[400] pointer-events-none">
        © Mapbox © OpenStreetMap
      </div>
    </div>
  );
};

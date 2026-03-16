import React, { useState } from 'react';
import { MapboxMap } from './MapboxMap';
import { StopPopup } from './StopPopup';
import { Stop, Vehicle, Coordinate, Journey } from '../types';
import { X, Box, ExternalLink } from 'lucide-react';

const UNC_P2P_ROUTES_PDF_URL = 'https://move.unc.edu/wp-content/uploads/sites/248/2022/08/unc-point-to-point-map.pdf';

interface MapViewProps {
  stops: Stop[];
  vehicles: Vehicle[];
  userLocation: Coordinate;
  onSelectBus: (bus: Vehicle) => void;
  onSelectStop: (stop: Stop) => void;
  onDismissStop: () => void;
  selectedStop: Stop | null;
  activeJourney?: Journey | null;
  onClearJourney?: () => void;
  onStartWalkToStop?: (journey: Journey) => void;
  userLocationResolved?: boolean;
  onViewList?: () => void;
  /** When set (e.g. timestamp), map flies to UNC campus center. */
  centerOnCampusAt?: number | null;
}

export const MapView: React.FC<MapViewProps> = ({
  stops,
  vehicles,
  userLocation,
  onSelectBus,
  onSelectStop,
  onDismissStop,
  selectedStop,
  activeJourney,
  onClearJourney,
  onStartWalkToStop,
  userLocationResolved = true,
  onViewList,
  centerOnCampusAt,
}) => {
  const [enable3D, setEnable3D] = useState(false);

  return (
    <div className="w-full h-full bg-gray-100 relative">
      <MapboxMap
        stops={stops}
        vehicles={vehicles}
        userLocation={userLocation}
        userLocationResolved={userLocationResolved}
        selectedStopId={selectedStop?.id ?? null}
        activeJourney={activeJourney ?? null}
        onSelectBus={onSelectBus}
        onSelectStop={onSelectStop}
        onMapClick={onDismissStop}
        enable3D={enable3D}
        onToggle3D={() => setEnable3D((v) => !v)}
        onOpenRoutes={() => window.open(UNC_P2P_ROUTES_PDF_URL, '_blank', 'noopener,noreferrer')}
        centerOnCampusAt={centerOnCampusAt}
        className="w-full h-full"
      />

      {/* Original 3D + Routes position when NOT navigating */}
      {!activeJourney && (
        <div className="absolute bottom-20 left-3 flex flex-col gap-2 z-[400]">
          <button
            type="button"
            onClick={() => setEnable3D((v) => !v)}
            className="min-w-[44px] min-h-[44px] px-4 py-2.5 rounded-2xl bg-white/95 backdrop-blur-sm shadow-md border border-gray-200/80 text-sm font-medium text-gray-700 hover:bg-white hover:shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            aria-label="Toggle 3D view"
            aria-pressed={enable3D}
          >
            <Box size={18} className="shrink-0" strokeWidth={2} />
            <span>3D</span>
          </button>
          <button
            type="button"
            onClick={() => window.open(UNC_P2P_ROUTES_PDF_URL, '_blank', 'noopener,noreferrer')}
            className="min-w-[44px] min-h-[44px] px-4 py-2.5 rounded-2xl bg-white/95 backdrop-blur-sm shadow-md border border-gray-200/80 text-sm font-medium text-gray-700 hover:bg-white hover:shadow-lg active:scale-[0.98] transition-all inline-flex items-center justify-center gap-2"
            aria-label="View P2P routes PDF"
          >
            <ExternalLink size={16} className="shrink-0" />
            <span>Routes</span>
          </button>
        </div>
      )}

      {activeJourney && (() => {
        const busSegment = activeJourney.segments.find((s) => s.type === 'bus');
        const routeLabel = busSegment
          ? `Navigating via ${busSegment.routeName ?? 'bus'}`
          : 'Navigating: Walk only (faster than bus)';
        const totalDistMeters = activeJourney.segments.reduce((sum, s) => sum + (s.distanceMeters ?? 0), 0);
        const distanceFeet = Math.round(totalDistMeters * 3.28084);
        return (
          <div className="absolute bottom-24 left-4 right-4 z-[400] animate-in slide-in-from-bottom-4 flex justify-center pointer-events-none">
            <div className="pointer-events-auto bg-white p-4 rounded-xl shadow-lg border border-gray-100 flex items-center justify-between gap-3 max-w-md w-full">
              <div className="min-w-0">
                <div className="text-xs font-bold text-gray-500 uppercase">Navigating to</div>
                <div className="font-bold text-gray-900 truncate">{activeJourney.destination.name}</div>
                <div className="text-xs text-p2p-blue font-semibold mt-0.5">{routeLabel}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {activeJourney.totalDurationMin} min
                  {distanceFeet > 0 && ` • ${distanceFeet.toLocaleString()} ft`}
                  {activeJourney.segments.length > 1 && ` • ${activeJourney.segments.length} steps`}
                </div>
              </div>
              <button
                type="button"
                onClick={onClearJourney}
                className="p-2 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200 shrink-0"
                aria-label="Clear journey"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        );
      })()}

      {selectedStop && !activeJourney && (
        <div className="absolute top-20 left-0 right-0 z-[400] flex justify-center pointer-events-none">
          <div className="pointer-events-auto">
            <StopPopup
              stop={selectedStop}
              userLocation={userLocation}
              userLocationResolved={userLocationResolved}
              onClose={onDismissStop}
              onWalkToStop={(journey) => {
                onStartWalkToStop?.(journey);
              }}
              onViewOnList={onViewList}
            />
          </div>
        </div>
      )}

      <div className="absolute bottom-20 right-2 bg-white/80 px-2 py-0.5 text-[10px] rounded text-gray-500 z-[400] pointer-events-none">
        © Mapbox © OpenStreetMap
      </div>
    </div>
  );
};

import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Stop, Vehicle, Coordinate, Journey } from '../types';
import { getDistanceMeters, getWalkTimeMinutes } from '../utils/geo';
import { Navigation, X } from 'lucide-react';

// Fix for default Leaflet icons in React using CDN links
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom Icons
const createBusIcon = (color: string) => L.divIcon({
  className: 'custom-bus-icon',
  html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const stopIcon = L.divIcon({
  className: 'custom-stop-icon',
  html: `<div style="background-color: white; width: 14px; height: 14px; border-radius: 50%; border: 3px solid #64748b; box-shadow: 0 1px 2px rgba(0,0,0,0.2);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const selectedStopIcon = L.divIcon({
  className: 'custom-selected-stop-icon',
  html: `<div style="background-color: #418FC5; width: 18px; height: 18px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const destIcon = L.divIcon({
  className: 'custom-dest-icon',
  html: `<div style="background-color: #C33934; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white;">
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

interface MapViewProps {
  stops: Stop[];
  vehicles: Vehicle[];
  userLocation: Coordinate;
  onSelectBus: (bus: Vehicle) => void;
  onSelectStop: (stop: Stop) => void;
  selectedStop: Stop | null;
  activeJourney?: Journey | null;
  onClearJourney?: () => void;
}

// Component to handle map center updates
const RecenterMap: React.FC<{ center: Coordinate, zoom?: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lon], zoom || map.getZoom());
  }, [center, zoom, map]);
  return null;
};

// Component to handle bounds for journeys
const FitJourney: React.FC<{ journey: Journey }> = ({ journey }) => {
  const map = useMap();
  useEffect(() => {
    const points = [
      [journey.segments[0].fromCoords.lat, journey.segments[0].fromCoords.lon],
      ...journey.segments.map(s => [s.toCoords.lat, s.toCoords.lon])
    ] as L.LatLngExpression[];
    
    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [50, 50] });
    }
  }, [journey, map]);
  return null;
};

const MapEvents: React.FC<{ onMapClick: () => void }> = ({ onMapClick }) => {
  useMapEvents({
    click: () => onMapClick(),
  });
  return null;
};

export const MapView: React.FC<MapViewProps> = ({ 
  stops, 
  vehicles, 
  userLocation, 
  onSelectBus,
  onSelectStop,
  selectedStop,
  activeJourney,
  onClearJourney
}) => {
  return (
    <div className="w-full h-full bg-gray-100 relative">
      <MapContainer 
        center={[userLocation.lat, userLocation.lon]} 
        zoom={15} 
        zoomControl={false}
        className="w-full h-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Journey Handling */}
        {activeJourney && <FitJourney journey={activeJourney} />}
        
        {activeJourney && activeJourney.segments.map((seg, idx) => (
          <React.Fragment key={idx}>
            <Polyline 
              positions={[
                [seg.fromCoords.lat, seg.fromCoords.lon],
                [seg.toCoords.lat, seg.toCoords.lon]
              ]}
              pathOptions={{
                color: seg.type === 'walk' ? '#418FC5' : '#C33934',
                weight: 5,
                opacity: 0.8,
                dashArray: seg.type === 'walk' ? '10, 10' : undefined
              }}
            />
            {/* Step Marker */}
            <Marker 
              position={[seg.fromCoords.lat, seg.fromCoords.lon]}
              icon={L.divIcon({
                 className: 'step-marker',
                 html: `<div style="background-color: ${seg.type === 'walk' ? '#fff' : '#C33934'}; color: ${seg.type === 'walk' ? '#418FC5' : '#fff'}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid #418FC5; font-size: 10px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(0,0,0,0.2);">${idx + 1}</div>`,
                 iconSize: [20, 20]
              })}
            />
          </React.Fragment>
        ))}

        {/* Destination Marker */}
        {activeJourney && (
          <Marker 
             position={[activeJourney.destination.lat, activeJourney.destination.lon]}
             icon={destIcon}
          />
        )}


        {/* User Location Marker */}
        <Marker 
          position={[userLocation.lat, userLocation.lon]}
          icon={L.divIcon({
            className: 'user-loc',
            html: `<div style="background-color: #4285F4; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 0 4px rgba(66, 133, 244, 0.3);"></div>`,
            iconSize: [16, 16]
          })}
        />

        {/* Stops */}
        {stops.map(stop => (
          <Marker
            key={stop.id}
            position={[stop.lat, stop.lon]}
            icon={selectedStop?.id === stop.id ? selectedStopIcon : stopIcon}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                onSelectStop(stop);
              }
            }}
          />
        ))}

        {/* Vehicles */}
        {vehicles.map(bus => (
          <Marker
            key={bus.id}
            position={[bus.lat, bus.lon]}
            icon={createBusIcon(bus.routeId === 'p2p-express' ? '#418FC5' : '#C33934')}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                onSelectBus(bus);
              }
            }}
          />
        ))}

        <MapEvents onMapClick={() => {
          // handled by parent
        }} />
      </MapContainer>

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
                onClick={onClearJourney}
                className="p-2 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200"
              >
                <X size={20} />
              </button>
           </div>
        </div>
      )}

      {/* Selected Stop Overlay Card (only if no active journey covers it) */}
      {selectedStop && !activeJourney && (
        <div className="absolute top-20 left-4 right-4 bg-white p-4 rounded-xl shadow-lg border border-gray-100 z-[400] animate-in fade-in slide-in-from-top-4 duration-300">
           <div className="flex justify-between items-center">
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
        </div>
      )}
      
      {/* Attribution Overlay */}
      <div className="absolute bottom-20 right-2 bg-white/80 px-2 py-0.5 text-[10px] rounded text-gray-500 z-[400] pointer-events-none">
        Leaflet | OpenStreetMap
      </div>
    </div>
  );
};

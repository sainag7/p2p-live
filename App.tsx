import React, { useEffect, useState, useMemo } from 'react';
import { ViewState, Vehicle, Stop, Coordinate, Journey } from './types';
import { STOPS, VEHICLES } from './data/mockTransit';
import { findNearestStop } from './utils/geo';
import { BottomNav } from './components/BottomNav';
import { ClosestStopCard } from './components/ClosestStopCard';
import { BusList } from './components/BusList';
import { BusDetailSheet } from './components/BusDetailSheet';
import { MapView } from './components/MapView';
import { PlanTripView } from './components/PlanTripView';
import { LocateFixed } from 'lucide-react';

// Default to UNC Student Union if geo denied
const DEFAULT_LOCATION: Coordinate = { lat: 35.9105, lon: -79.0478 };

function App() {
  const [view, setView] = useState<ViewState>('list');
  const [userLocation, setUserLocation] = useState<Coordinate>(DEFAULT_LOCATION);
  const [selectedBus, setSelectedBus] = useState<Vehicle | null>(null);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [activeJourney, setActiveJourney] = useState<Journey | null>(null);
  const [loadingLoc, setLoadingLoc] = useState(true);

  // Geolocation Setup
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
          setLoadingLoc(false);
        },
        (error) => {
          console.warn('Geolocation denied or error:', error);
          setLoadingLoc(false);
        },
        { enableHighAccuracy: true }
      );
    } else {
      setLoadingLoc(false);
    }
  }, []);

  // Derived State
  const closestStop = useMemo(() => findNearestStop(userLocation, STOPS), [userLocation]);

  const handlePlanRoute = (journey: Journey) => {
    setActiveJourney(journey);
  };

  const handleViewOnMap = () => {
    setView('map');
  };

  return (
    <div className="h-full w-full flex flex-col bg-gray-50 overflow-hidden relative">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 pt-12 pb-3 px-4 flex justify-between items-center shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-2">
           <h1 className="text-2xl font-black text-p2p-blue tracking-tight">P<span className="text-p2p-red">2</span>P <span className="text-p2p-black">Live</span></h1>
           <span className="px-2 py-0.5 bg-p2p-light-red/30 text-p2p-red text-[10px] font-bold uppercase rounded-full tracking-wide">UNC Chapel Hill</span>
        </div>
        {loadingLoc && <LocateFixed className="animate-spin text-gray-300" size={20} />}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden">
        {view === 'list' && (
          <div className="h-full overflow-y-auto no-scrollbar pb-20">
            {closestStop && (
              <ClosestStopCard 
                stop={closestStop} 
                userLocation={userLocation} 
                vehicles={VEHICLES}
              />
            )}
            <BusList 
              vehicles={VEHICLES} 
              stops={STOPS} 
              onSelectBus={(bus) => setSelectedBus(bus)}
            />
          </div>
        )}

        {view === 'plan' && (
          <PlanTripView 
            userLocation={userLocation}
            onPlanRoute={handlePlanRoute}
            onViewOnMap={handleViewOnMap}
            existingJourney={activeJourney}
          />
        )}
        
        {view === 'map' && (
          <div className="h-full w-full relative">
            <MapView 
              stops={STOPS}
              vehicles={VEHICLES}
              userLocation={userLocation}
              onSelectBus={(bus) => {
                setSelectedBus(bus);
                setSelectedStop(null);
              }}
              onSelectStop={(stop) => {
                setSelectedStop(stop);
              }}
              selectedStop={selectedStop}
              activeJourney={activeJourney}
              onClearJourney={() => setActiveJourney(null)}
            />
          </div>
        )}
      </main>

      {/* Shared Overlays */}
      <BusDetailSheet 
        vehicle={selectedBus} 
        stops={STOPS}
        userLocation={userLocation}
        onClose={() => setSelectedBus(null)} 
      />

      <BottomNav currentView={view} onChangeView={setView} />
    </div>
  );
}

export default App;

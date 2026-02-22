import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { ViewState, Vehicle, Stop, Coordinate, Journey, Destination } from './types';
import { STOPS, VEHICLES } from './data/mockTransit';
import { findNearestStop } from './utils/geo';
import { BottomNav } from './components/BottomNav';
import { ClosestStopCard } from './components/ClosestStopCard';
import { BusList } from './components/BusList';
import { BusDetailSheet } from './components/BusDetailSheet';
import { MapView } from './components/MapView';
import { PlanTripView } from './components/PlanTripView';
import { AppHeader } from './components/AppHeader';

// Default to UNC Student Union if geo denied
const DEFAULT_LOCATION: Coordinate = { lat: 35.9105, lon: -79.0478 };

function App() {
  const [view, setView] = useState<ViewState>('list');
  const [userLocation, setUserLocation] = useState<Coordinate>(DEFAULT_LOCATION);
  const [selectedBus, setSelectedBus] = useState<Vehicle | null>(null);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [activeJourney, setActiveJourney] = useState<Journey | null>(null);
  const [loadingLoc, setLoadingLoc] = useState(true);
  /** One-time destination when navigating from map stop "Route to this stop". Consumed by Plan Trip on mount. */
  const [pendingDestinationForPlan, setPendingDestinationForPlan] = useState<Destination | null>(null);

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

  const navigateToPlanTrip = useCallback((destination: Destination) => {
    setPendingDestinationForPlan(destination);
    setView('plan');
  }, []);

  const clearPendingDestinationForPlan = useCallback(() => {
    setPendingDestinationForPlan(null);
  }, []);

  return (
    <div className="h-full w-full flex flex-col bg-gray-50 overflow-hidden relative">
      <AppHeader loadingLoc={loadingLoc} />

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
            pendingDestination={pendingDestinationForPlan}
            onConsumePendingDestination={clearPendingDestinationForPlan}
          />
        )}
        
        {view === 'map' && (
          <div className="h-full w-full relative">
            <MapView 
              stops={STOPS}
              vehicles={VEHICLES}
              userLocation={userLocation}
              userLocationResolved={!loadingLoc}
              onSelectBus={(bus) => {
                setSelectedBus(bus);
                setSelectedStop(null);
              }}
              onSelectStop={(stop) => {
                setSelectedStop(stop);
              }}
              onRouteToStop={navigateToPlanTrip}
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

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { ViewState, Vehicle, Stop, Coordinate, Journey } from './types';
import { STOPS, VEHICLES } from './data/mockTransit';
import { findNearestStop, getDistanceMiles, UNC_CAMPUS_CENTER, SERVICE_RADIUS_MILES } from './utils/geo';
import { BottomNav } from './components/BottomNav';
import { ClosestStopCard } from './components/ClosestStopCard';
import { BusList } from './components/BusList';
import { BusDetailSheet } from './components/BusDetailSheet';
import { MapView } from './components/MapView';
import { PlanTripView } from './components/PlanTripView';
import { AppHeader } from './components/AppHeader';
import { RefreshCw, X } from 'lucide-react';

// Default to UNC Student Union if geo denied
const DEFAULT_LOCATION: Coordinate = { lat: 35.9105, lon: -79.0478 };

function App() {
  const [view, setView] = useState<ViewState>('list');
  const [userLocation, setUserLocation] = useState<Coordinate>(DEFAULT_LOCATION);
  const [selectedBus, setSelectedBus] = useState<Vehicle | null>(null);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [activeJourney, setActiveJourney] = useState<Journey | null>(null);
  const [loadingLoc, setLoadingLoc] = useState(true);
  const [geoResolved, setGeoResolved] = useState(false); // true only when getCurrentPosition succeeds
  const [outsideAreaMiles, setOutsideAreaMiles] = useState<number | null>(null);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [centerOnCampusAt, setCenterOnCampusAt] = useState<number | null>(null);
  const computedOutsideAreaRef = useRef(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>(VEHICLES);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // Geolocation Setup
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
          setGeoResolved(true);
          setLoadingLoc(false);
        },
        () => {
          setLoadingLoc(false);
        },
        { enableHighAccuracy: true }
      );
    } else {
      setLoadingLoc(false);
    }
  }, []);

  // Distance warning dismissal persistence (session-scoped)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const dismissed = window.sessionStorage.getItem('p2p-distance-warning-dismissed');
      if (dismissed === 'true') {
        setWarningDismissed(true);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  // Location validation: compute once when we have real geo and show banner if > 15 miles
  useEffect(() => {
    if (loadingLoc || !geoResolved || computedOutsideAreaRef.current) return;
    computedOutsideAreaRef.current = true;
    const miles = getDistanceMiles(userLocation, UNC_CAMPUS_CENTER);
    if (miles > SERVICE_RADIUS_MILES) {
      setOutsideAreaMiles(miles);
    }
  }, [loadingLoc, geoResolved, userLocation]);

  // Derived State
  const closestStop = useMemo(() => findNearestStop(userLocation, STOPS), [userLocation]);

  const handlePlanRoute = (journey: Journey) => {
    setActiveJourney(journey);
  };

  const handleViewOnMap = () => {
    setView('map');
  };

  const handleRefreshEtas = useCallback(async () => {
    setRefreshLoading(true);
    try {
      // TODO: replace with real API when available, e.g. fetch('/api/vehicles/etas')
      await new Promise((r) => setTimeout(r, 800));
      setVehicles((prev) => [...prev]);
      setLastUpdated(Date.now());
    } finally {
      setRefreshLoading(false);
    }
  }, []);

  const dismissDistanceWarning = useCallback(() => {
    setWarningDismissed(true);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem('p2p-distance-warning-dismissed', 'true');
      } catch {
        // ignore storage errors
      }
    }
  }, []);

  return (
    <div className="min-h-[100dvh] h-full w-full flex flex-col bg-gray-50 relative">
      <AppHeader loadingLoc={loadingLoc} />

      {/* Main Content Area: flex-1 min-h-0 so list can scroll */}
      <main className="flex-1 min-h-0 flex flex-col relative">
        {/* Outside service area notice (informational only) */}
        {outsideAreaMiles != null && outsideAreaMiles > SERVICE_RADIUS_MILES && !warningDismissed && (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-4">
            <div className="pointer-events-auto w-full max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm relative">
              <button
                type="button"
                onClick={dismissDistanceWarning}
                className="absolute right-2 top-2 inline-flex items-center justify-center rounded-full p-1.5 text-amber-700 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                aria-label="Dismiss distance warning"
              >
                <X size={14} />
              </button>
              <p className="text-sm font-medium text-amber-900 pr-6">
                You appear to be{' '}
                <strong>{Math.round(outsideAreaMiles)} miles from UNC Chapel Hill</strong>. P2P Live is designed
                for use on or near campus.
              </p>
              <p className="text-xs text-amber-800/90 mt-1 pr-6">
                You can still explore routes, but live bus tracking may not be relevant at your current location.
              </p>
              <button
                type="button"
                onClick={() => {
                  dismissDistanceWarning();
                  setView('map');
                  setCenterOnCampusAt(Date.now());
                }}
                className="mt-3 inline-flex items-center justify-center px-3 py-2 rounded-lg bg-amber-200/80 text-amber-900 text-sm font-semibold hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                Center Map on UNC
              </button>
            </div>
          </div>
        )}

        {view === 'list' && (
          <div
            className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-20"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {/* Closest Stop section: same horizontal padding as Active Buses */}
            {closestStop && (
              <div className="px-4 pt-4 pb-2">
                <h2 className="text-gray-900 font-bold text-lg mb-1">Closest Stop to You</h2>
                <ClosestStopCard 
                  stop={closestStop} 
                  userLocation={userLocation} 
                  vehicles={vehicles}
                />
              </div>
            )}
            {/* Active Buses section: aligned padding */}
            <div className="px-4 pt-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-gray-900 font-bold text-lg">Active Buses</h2>
                {lastUpdated != null && (
                  <span className="text-xs text-gray-400">
                    Updated {lastUpdated > Date.now() - 60000 ? 'just now' : new Date(lastUpdated).toLocaleTimeString()}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleRefreshEtas}
                disabled={refreshLoading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-p2p-light-blue/50 text-p2p-blue text-sm font-semibold hover:bg-p2p-light-blue/70 disabled:opacity-60 disabled:pointer-events-none"
                aria-label="Refresh ETAs"
              >
                <RefreshCw size={18} className={refreshLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
            <BusList 
              vehicles={vehicles} 
              stops={STOPS} 
              onSelectBus={(bus) => setSelectedBus(bus)}
            />
          </div>
        )}

        {view === 'plan' && (
          <div
            className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-20"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <PlanTripView 
              userLocation={userLocation}
              onPlanRoute={handlePlanRoute}
              onViewOnMap={handleViewOnMap}
              existingJourney={activeJourney}
            />
          </div>
        )}
        
        {view === 'map' && (
          <div className="h-full w-full relative">
            <MapView 
              stops={STOPS}
              vehicles={vehicles}
              userLocation={userLocation}
              userLocationResolved={!loadingLoc}
              centerOnCampusAt={centerOnCampusAt}
              onSelectBus={(bus) => {
                setSelectedBus(bus);
                setSelectedStop(null);
              }}
              onSelectStop={(stop) => {
                setSelectedStop((prev) => (prev?.id === stop.id ? null : stop));
              }}
              onDismissStop={() => setSelectedStop(null)}
              selectedStop={selectedStop}
              activeJourney={activeJourney}
              onClearJourney={() => setActiveJourney(null)}
              onStartWalkToStop={(journey) => setActiveJourney(journey)}
              onViewList={() => { setView('list'); setSelectedStop(null); }}
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

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { ViewState, Stop, Coordinate, Journey, Destination } from './types';
import { getDistanceMiles, UNC_CAMPUS_CENTER, SERVICE_RADIUS_MILES } from './utils/geo';
import { BottomNav } from './components/BottomNav';
import { HomeView } from './components/HomeView';
import { BusDetailSheet } from './components/BusDetailSheet';
import { MapView } from './components/MapView';
import { SearchSheet, type SearchSheetRequest } from './components/SearchSheet';
import { AppHeader } from './components/AppHeader';
import { X } from 'lucide-react';
import { useTransit } from './context/TransitProvider';
import { getStarredPlaces, toggleStarredPlace } from './storage/starredPlaces';
import { eligibleCampusLocation } from './utils/mapPresentation';
import './components/passenger.css';
import './components/classic-rider.css';
import { ServiceMessageBanner } from './components/ServiceMessageBanner';
import { useLiveLocation } from './hooks/useLiveLocation';

// Default to UNC Student Union if geo denied
const DEFAULT_LOCATION: Coordinate = { lat: 35.9105, lon: -79.0478 };

function App() {
  const [view, setView] = useState<ViewState>('list');
  const [mapVisited, setMapVisited] = useState(false);
  useEffect(() => { if (view === 'map') setMapVisited(true); }, [view]);
  // Follows the rider as they move while the site is open (falls back to the Union if denied).
  const { location: userLocation, resolved: geoResolved, loading: loadingLoc } = useLiveLocation(DEFAULT_LOCATION);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [activeJourney, setActiveJourney] = useState<Journey | null>(null);
  const [searchRequest, setSearchRequest] = useState<SearchSheetRequest | null>(null);
  const [behindSheet, setBehindSheet] = useState(false);
  const [starred, setStarred] = useState<Destination[]>(() => getStarredPlaces());
  const appRoot = useRef<HTMLDivElement>(null);
  const searchOpener = useRef<HTMLElement | null>(null);
  const [outsideAreaMiles, setOutsideAreaMiles] = useState<number | null>(null);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [centerOnCampusAt, setCenterOnCampusAt] = useState<number | null>(null);
  const computedOutsideAreaRef = useRef(false);
  const noticesRef = useRef<HTMLDivElement>(null);
  const [noticeHeight, setNoticeHeight] = useState(0);
  const { network, vehicles } = useTransit();
  const selectedBus = useMemo(() => vehicles.find((v) => v.id === selectedBusId) ?? null, [vehicles, selectedBusId]);
  const networkStops = useMemo(() => network?.stops ?? [], [network]);
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

  useEffect(() => {
    const node = noticesRef.current;
    if (!node) return;
    const measure = () => setNoticeHeight(node.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [view]);

  // Mount the sheet inside the tap itself so it can focus its field and phones raise the keyboard.
  const openSearch = useCallback((from: HTMLElement, place?: Destination) => {
    searchOpener.current = from;
    flushSync(() => setSearchRequest({ origin: from.getBoundingClientRect(), label: place ? place.name : 'Search a building or stop', place }));
  }, []);

  const closeSearch = useCallback(() => {
    setSearchRequest(null);
    setBehindSheet(false);
    // Inert elements can't take focus, so lift it now rather than waiting for the effect.
    appRoot.current?.removeAttribute('inert');
    if (searchOpener.current?.isConnected) searchOpener.current.focus({ preventScroll: true });
    searchOpener.current = null;
  }, []);

  // While the sheet is up, the app behind is inert and the page edges show the dark backdrop.
  useEffect(() => {
    const open = searchRequest != null;
    appRoot.current?.toggleAttribute('inert', open);
    document.documentElement.classList.toggle('has-search-sheet', open);
  }, [searchRequest]);

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
    <>
    <div ref={appRoot} className={`passenger-app ${view !== 'map' ? 'is-light' : ''} ${behindSheet ? 'is-behind-sheet' : ''} min-h-[100dvh] h-full w-full flex flex-col relative`} style={{ background: view === 'map' ? undefined : 'var(--rider-bg)' }}>
      <AppHeader loadingLoc={loadingLoc} compact={view === 'map'} home />

      {/* Main Content Area: flex-1 min-h-0 so list can scroll */}
      <main className={`flex-1 min-h-0 flex flex-col relative ${view === 'list' ? 'home-main' : ''}`}>
        {/* Outside service area notice (informational only) */}
        <div ref={noticesRef} className={view === 'list' ? 'home-notices' : 'pointer-events-none absolute inset-x-0 top-2 z-30 flex flex-col items-center gap-2 px-4 max-h-[30dvh] overflow-y-auto'}>
          <ServiceMessageBanner />
          {outsideAreaMiles != null && outsideAreaMiles > SERVICE_RADIUS_MILES && !warningDismissed && (
            <div className="rider-banner is-warning pointer-events-auto">
              <button
                type="button"
                onClick={dismissDistanceWarning}
                className="rider-banner-dismiss"
                aria-label="Dismiss distance warning"
              >
                <X size={14} />
              </button>
              <p className="rider-banner-title">
                You’re about {Math.round(outsideAreaMiles)} miles from UNC Chapel Hill
              </p>
              <p className="rider-banner-body">
                P2P Live is meant for campus. You can still explore routes, but live tracking may not match where you are.
              </p>
              <button
                type="button"
                onClick={() => {
                  dismissDistanceWarning();
                  setView('map');
                  setCenterOnCampusAt(Date.now());
                }}
                className="rider-banner-action"
              >
                Center Map on UNC
              </button>
            </div>
          )}
        </div>

        {view === 'list' && <HomeView location={userLocation} locationResolved={geoResolved} loadingLocation={loadingLoc}
          starred={starred} onOpenSearch={openSearch}
          onSelectBus={bus => { setSelectedStop(null); setActiveJourney(null); setSelectedBusId(bus.id); }}
          onSelectStop={stop => { setSelectedBusId(null); setActiveJourney(null); setSelectedStop(stop); setView('map'); }}
          onBrowseMap={() => { setSelectedBusId(null); setSelectedStop(null); setActiveJourney(null); setCenterOnCampusAt(Date.now()); setView('map'); }} />}

        {(view === 'map' || mapVisited) && (
          <div hidden={view !== 'map'} className="h-full w-full relative pb-[calc(49px+env(safe-area-inset-bottom))]">
            <MapView
              active={view === 'map'}
              vehicles={vehicles}
              userLocation={userLocation}
              userLocationResolved={geoResolved}
              centerOnCampusAt={centerOnCampusAt}
              topInset={noticeHeight > 0 ? noticeHeight + 8 : 0}
              busDetailsOpen={selectedBus != null}
              onSelectBus={(bus) => {
                setSelectedBusId(bus.id);
                setSelectedStop(null);
                setActiveJourney(null);
              }}
              onSelectStop={(stop) => {
                setSelectedBusId(null);
                setActiveJourney(null);
                setSelectedStop(stop);
              }}
              onDismissStop={() => setSelectedStop(null)}
              selectedStop={selectedStop}
              activeJourney={activeJourney}
              onClearJourney={() => setActiveJourney(null)}
              onStartWalkToStop={(journey) => setActiveJourney(journey)}
            />
          </div>
        )}
      </main>

      {/* Shared Overlays */}
      {selectedBus && (
        <BusDetailSheet
          vehicle={selectedBus}
          stops={networkStops}
          userLocation={geoResolved && outsideAreaMiles == null ? userLocation : null}
          onClose={() => setSelectedBusId(null)}
        />
      )}

      <BottomNav currentView={view} onChangeView={setView} />
    </div>
    {searchRequest && <SearchSheet request={searchRequest} location={userLocation}
      locationKnown={eligibleCampusLocation(userLocation, geoResolved) != null}
      starred={starred} onToggleStar={place => setStarred(toggleStarredPlace(place))}
      onBehindChange={setBehindSheet}
      onSelectStop={stop => { searchOpener.current = null; setSelectedBusId(null); setActiveJourney(null); setSelectedStop(stop); setView('map'); }}
      onStartTrip={journey => { searchOpener.current = null; setSelectedBusId(null); setSelectedStop(null); setActiveJourney(journey); setView('map'); }}
      onClosed={closeSearch} />}
    </>
  );
}

export default App;

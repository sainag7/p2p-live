import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Search, MapPin, ArrowRight, Bus, User, Navigation, History, X } from 'lucide-react';
import { Destination, Journey, Coordinate } from '../types';
import { MOCK_DESTINATIONS } from '../data/mockTransit';
import { POPULAR_LOCATIONS } from '../data/popularLocations';
import { TOP_LOCATIONS, topLocationToDestination } from '../data/topLocations';
import { getRecentSearches, addRecentSearch, clearRecentSearches, type RecentSearchItem } from '../storage/recentSearches';
import { computeMultimodalRoute } from '../utils/multimodalRouting';
import { formatDuration, formatDistanceImperial, formatETA } from '../utils/format';
import { ROUTE_CONFIGS } from '../data/routeConfig';
import { API } from '../utils/api';

const TOP_DESTINATIONS: Destination[] = TOP_LOCATIONS.map(topLocationToDestination);

const ALL_DESTINATIONS = (() => {
  const byId = new Map<string, Destination>();
  [...TOP_DESTINATIONS, ...POPULAR_LOCATIONS, ...MOCK_DESTINATIONS].forEach((d) => byId.set(d.id, d));
  return Array.from(byId.values());
})();

interface GeocodeResult {
  id: string;
  place_name: string;
  coordinates: [number, number];
  type: string;
}

interface PlanTripViewProps {
  userLocation: Coordinate;
  onPlanRoute: (journey: Journey) => void;
  onViewOnMap: () => void;
  existingJourney: Journey | null;
}

export const PlanTripView: React.FC<PlanTripViewProps> = ({ 
  userLocation, 
  onPlanRoute, 
  onViewOnMap,
  existingJourney 
}) => {
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>(() => getRecentSearches());
  const [journey, setJourney] = useState<Journey | null>(existingJourney);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [addressResults, setAddressResults] = useState<GeocodeResult[]>([]);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownScrollRef = useRef<HTMLDivElement>(null);

  const stopNameById = useMemo(() => {
    const m = new Map<string, string>();
    ROUTE_CONFIGS.forEach((r) => r.stops.forEach((s) => m.set(s.id, s.name)));
    return m;
  }, []);

  useEffect(() => () => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current); }, []);

  const topLocationSuggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOP_DESTINATIONS;
    return TOP_LOCATIONS.filter((loc) => {
      const fields = [loc.name, loc.address, ...loc.aliases];
      return fields.some((f) => f.toLowerCase().includes(q));
    }).map(topLocationToDestination);
  }, [query]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setAddressResults([]);
      setGeocodeLoading(false);
      return;
    }
    const controller = new AbortController();
    setGeocodeLoading(true);
    const t = setTimeout(() => {
      fetch(
        `${API}/api/mapbox/geocode?q=${encodeURIComponent(q)}&proximity=${userLocation.lon},${userLocation.lat}`,
        { signal: controller.signal }
      )
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))))
        .then((data: { results?: GeocodeResult[] }) => {
          setAddressResults(Array.isArray(data.results) ? data.results : []);
        })
        .catch((err) => {
          if ((err as Error).name === 'AbortError') return;
          setAddressResults([]);
        })
        .finally(() => setGeocodeLoading(false));
    }, 280);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [query, userLocation.lon, userLocation.lat]);

  const showDropdownUnfocused = !searchFocused;
  const showDropdownFocusedEmpty = searchFocused && query.trim().length === 0;
  const showDropdownFocusedQuery = searchFocused && query.trim().length > 0;

  const refreshRecent = useCallback(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  const handleSelectDestination = useCallback(
    async (dest: Destination) => {
      setQuery(dest.name);
      setSearchFocused(false);
      addRecentSearch({ label: dest.name, address: dest.address, lat: dest.lat, lon: dest.lon });
      refreshRecent();
      setRoutingLoading(true);
      try {
        const newJourney = await computeMultimodalRoute({
          origin: userLocation,
          destination: dest,
        });
        setJourney(newJourney);
        onPlanRoute(newJourney);
      } catch (e) {
        console.error(e);
        alert('Could not calculate route');
      } finally {
        setRoutingLoading(false);
      }
    },
    [userLocation, onPlanRoute, refreshRecent]
  );

  const handleSelectAddressResult = useCallback(
    (item: GeocodeResult) => {
      const [lon, lat] = item.coordinates;
      const dest: Destination = {
        id: `addr-${item.id}`,
        name: item.place_name,
        lat,
        lon,
        address: item.place_name,
      };
      handleSelectDestination(dest);
    },
    [handleSelectDestination]
  );

  const handleSelectRecent = useCallback(
    async (item: RecentSearchItem) => {
      const dest: Destination =
        item.lat != null && item.lon != null
          ? { id: `recent-${item.label}`, name: item.label, lat: item.lat, lon: item.lon }
          : ALL_DESTINATIONS.find((d) => d.name.toLowerCase() === item.label.toLowerCase()) ?? {
              id: `recent-${item.label}`,
              name: item.label,
              lat: 35.91,
              lon: -79.05,
            };
      setQuery(dest.name);
      setSearchFocused(false);
      addRecentSearch({ label: dest.name, address: item.address, lat: dest.lat, lon: dest.lon });
      refreshRecent();
      setRoutingLoading(true);
      try {
        const newJourney = await computeMultimodalRoute({
          origin: userLocation,
          destination: dest,
        });
        setJourney(newJourney);
        onPlanRoute(newJourney);
      } catch (e) {
        console.error(e);
        alert('Could not calculate route');
      } finally {
        setRoutingLoading(false);
      }
    },
    [userLocation, onPlanRoute, refreshRecent]
  );

  const handleClearRecent = useCallback(() => {
    clearRecentSearches();
    setRecentSearches([]);
  }, []);

  type SelectableEntry =
    | { type: 'top'; dest: Destination }
    | { type: 'recent'; item: RecentSearchItem }
    | { type: 'address'; item: GeocodeResult };
  const selectableItems = useMemo((): SelectableEntry[] => {
    if (showDropdownUnfocused) return TOP_DESTINATIONS.map((dest) => ({ type: 'top', dest }));
    if (showDropdownFocusedEmpty)
      return [
        ...recentSearches.map((item) => ({ type: 'recent' as const, item })),
        ...TOP_DESTINATIONS.map((dest) => ({ type: 'top' as const, dest })),
      ];
    if (showDropdownFocusedQuery)
      return [
        ...topLocationSuggestions.map((dest) => ({ type: 'top' as const, dest })),
        ...addressResults.map((item) => ({ type: 'address' as const, item })),
      ];
    return [];
  }, [
    showDropdownUnfocused,
    showDropdownFocusedEmpty,
    showDropdownFocusedQuery,
    recentSearches,
    topLocationSuggestions,
    addressResults,
  ]);

  useEffect(() => {
    setHighlightedIndex((prev) => (prev >= selectableItems.length ? 0 : Math.min(prev, selectableItems.length - 1)));
  }, [selectableItems.length]);

  useEffect(() => {
    if (selectableItems.length === 0) return;
    const el = dropdownScrollRef.current?.querySelector(`[data-dropdown-index="${highlightedIndex}"]`);
    (el as HTMLElement)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightedIndex, selectableItems.length]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        (e.target as HTMLInputElement).blur();
        setSearchFocused(false);
        return;
      }
      if (selectableItems.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % selectableItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + selectableItems.length) % selectableItems.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const entry = selectableItems[highlightedIndex];
        if (!entry) return;
        if (entry.type === 'top') handleSelectDestination(entry.dest);
        else if (entry.type === 'recent') handleSelectRecent(entry.item);
        else if (entry.type === 'address') handleSelectAddressResult(entry.item);
      }
    },
    [selectableItems, highlightedIndex, handleSelectDestination, handleSelectRecent, handleSelectAddressResult]
  );

  const handleNewSearch = () => {
    setQuery('');
    setJourney(null);
    onPlanRoute(null as any); // Clear journey in parent
  };

  if (routingLoading) {
    return (
      <div className="flex flex-col h-full bg-gray-50 items-center justify-center p-8">
        <div className="w-12 h-12 border-4 border-p2p-blue border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-600 font-medium">Finding best route…</p>
        <p className="text-sm text-gray-400 mt-1">Walk and bus options with Mapbox</p>
      </div>
    );
  }

  // Render Result View
  if (journey) {
    const totalDurationSeconds = journey.totalDurationMin * 60;
    const now = new Date();
    const bufferSec = 90;
    const firstWalk = journey.segments.find((s) => s.type === 'walk') ?? null;
    const busSeg = journey.segments.find((s) => s.type === 'bus') ?? null;
    const hasBus = !!busSeg;
    const hasBusArrivalEstimate = hasBus && busSeg?.waitTimeMin != null && firstWalk != null;
    const walkToStartStopSec = firstWalk ? firstWalk.durationMin * 60 : 0;
    const waitAtStopSec = busSeg?.waitTimeMin != null ? busSeg.waitTimeMin * 60 : 0;
    const nextBusAt =
      hasBusArrivalEstimate ? new Date(now.getTime() + (walkToStartStopSec + waitAtStopSec) * 1000) : null;
    const leaveAt =
      hasBusArrivalEstimate ? new Date(now.getTime() + (waitAtStopSec - bufferSec) * 1000) : null;
    const shouldLeaveNow = leaveAt != null && leaveAt.getTime() <= now.getTime();
    return (
      <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
        {/* Journey Summary Header */}
        <div className="bg-white p-5 border-b border-gray-100 shadow-sm shrink-0">
            <h2 className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Total Time</h2>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-3xl font-black text-gray-900">
                {formatDuration(totalDurationSeconds)}
              </span>
            </div>
            <div className="text-sm text-gray-600 mb-1">
              <span className="font-semibold">ETA:</span>{' '}
              <span>{formatETA(totalDurationSeconds)}</span>
            </div>
            {journey.segments.some((s) => s.type === 'bus') ? (
              <div className="text-xs text-p2p-blue font-semibold mb-2">
                Via {journey.segments.find((s) => s.type === 'bus')?.routeName ?? 'bus'}
              </div>
            ) : (
              <div className="text-xs text-gray-500 mb-2">Walk only (faster than bus)</div>
            )}
            {hasBus ? (
              hasBusArrivalEstimate && nextBusAt && leaveAt ? (
                <div className="text-xs text-gray-600 mb-3 space-y-1">
                  <div>
                    <span className="font-semibold text-gray-700">Leave at:</span>{' '}
                    <span className="font-semibold text-gray-900">
                      {shouldLeaveNow ? 'Leave now' : leaveAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-gray-500">
                    To catch: <span className="font-semibold text-gray-700">{busSeg?.routeName ?? 'bus'}</span>{' '}
                    (next bus at {nextBusAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })})
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-500 mb-3">No upcoming arrivals — using walking-only estimate.</div>
              )
            ) : null}
            <div className="text-xs text-gray-500 mb-4">
              {journey.segments.length === 1 ? (
                <>Walk: {formatDuration(journey.segments[0].durationMin * 60)}</>
              ) : (
                <>
                  Walk to Stop: {formatDuration((journey.segments[0]?.durationMin ?? 0) * 60)}
                  {' • '}
                  Ride {journey.segments[1]?.routeName}: {formatDuration((journey.segments[1]?.durationMin ?? 0) * 60)}
                  {' • '}
                  Walk to Destination: {formatDuration((journey.segments[2]?.durationMin ?? 0) * 60)}
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
               {journey.segments.map((seg, i) => (
                 <div key={i} className={`flex items-center text-xs font-bold px-2 py-1 rounded-md border ${
                   seg.type === 'walk' ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-p2p-blue/10 text-p2p-blue border-p2p-blue/20'
                 }`}>
                   {seg.type === 'walk' ? <User size={12} className="mr-1"/> : <Bus size={12} className="mr-1"/>}
                   {formatDuration(seg.durationMin * 60)}
                 </div>
               ))}
            </div>

            <div className="flex gap-3">
              <button 
                onClick={onViewOnMap}
                className="flex-1 bg-p2p-blue text-white py-3 rounded-xl font-bold text-sm shadow-md active:scale-[0.98] transition-transform flex items-center justify-center"
              >
                <Navigation size={18} className="mr-2" />
                Start Navigation
              </button>
              <button 
                onClick={handleNewSearch}
                className="px-4 py-3 bg-gray-100 text-gray-700 font-bold text-sm rounded-xl hover:bg-gray-200 transition-colors"
              >
                New Search
              </button>
            </div>
        </div>

        {/* Steps List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
           {journey.segments.map((seg, idx) => (
             <div key={idx} className="relative pl-8 group">
                {/* Connector Line */}
                {(idx !== journey.segments.length - 1 ||
                  (idx === journey.segments.length - 1 && seg.type === 'walk')) && (
                  <div
                    className={`absolute left-[15px] top-8 ${
                      idx === journey.segments.length - 1 ? 'bottom-[-48px]' : 'bottom-[-24px]'
                    } w-1 ${seg.type === 'bus' ? 'bg-p2p-blue' : 'border-l-2 border-dashed border-gray-300 ml-[3px]'}`}
                  />
                )}

                {/* Icon Marker */}
                <div className={`absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center z-10 border-2 border-white shadow-sm ${
                  seg.type === 'bus' ? 'bg-p2p-blue text-white' : 'bg-gray-400 text-white'
                }`}>
                  {seg.type === 'bus' ? <Bus size={16} /> : <User size={16} />}
                </div>

                {/* Content */}
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                   <div className="flex justify-between items-start mb-2">
                     <h3 className="font-bold text-gray-900">{seg.instruction}</h3>
                     <span className="text-sm font-semibold text-gray-500 whitespace-nowrap">
                       {formatDuration(seg.durationMin * 60)}
                     </span>
                   </div>
                   
                   {seg.type === 'bus' && (
                     <div className="mt-2">
                        <div className="inline-block bg-p2p-blue text-white text-xs font-bold px-2 py-0.5 rounded mb-2">
                          {seg.routeName}
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          {seg.busOrderedStopIds && seg.busOrderedStopIds.length > 0 ? (
                            <>
                              <div className="font-medium text-gray-700">Board at {seg.fromName}</div>
                              {seg.busOrderedStopIds.slice(1, -1).map((id) => (
                                <div key={id} className="flex items-center pl-3 border-l-2 border-gray-200 ml-1">
                                  <span className="text-gray-500">{stopNameById.get(id) ?? id}</span>
                                </div>
                              ))}
                              <div className="font-medium text-gray-700">Get off at {seg.toName}</div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-gray-300 mr-2"/> Board at {seg.fromName}</div>
                              <div className="flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-gray-300 mr-2"/> Get off at {seg.toName}</div>
                            </>
                          )}
                          {seg.stopsCount != null && (
                            <div className="text-xs text-gray-400 mt-1 pl-3.5">{seg.stopsCount} stops</div>
                          )}
                        </div>
                     </div>
                   )}

                  {seg.type === 'walk' && (
                    <div className="space-y-1">
                      <div className="text-sm text-gray-500">
                        Walk {formatDistanceImperial(seg.distanceMeters)}
                      </div>
                      {seg.steps && seg.steps.length > 0 && (
                        <ul className="mt-2 space-y-1 text-xs text-gray-500 border-l-2 border-gray-200 pl-3">
                          {seg.steps.map((step, i) => (
                            <li key={i}>{step.instruction}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
             </div>
           ))}
           
           {/* Destination Marker */}
           <div className="relative pl-8">
             <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-p2p-red text-white flex items-center justify-center z-10 border-2 border-white shadow-sm">
               <MapPin size={16} />
             </div>
             <div className="pt-1">
               <div className="font-bold text-gray-900 text-lg">{journey.destination.name}</div>
               <div className="text-sm text-gray-500">You have arrived</div>
             </div>
           </div>
        </div>
      </div>
    );
  }

  // Render Search View
  const dropdownContent = (
    <div ref={dropdownScrollRef} className="max-h-[60vh] overflow-y-auto pt-4 pb-2 px-2" style={{ WebkitOverflowScrolling: 'touch' }}>
      {showDropdownUnfocused && (
        <>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-2">Top Destinations</h3>
          <ul className="space-y-1" role="listbox" aria-label="Top destinations" aria-activedescendant={selectableItems.length ? `dropdown-option-${highlightedIndex}` : undefined}>
            {TOP_DESTINATIONS.map((dest, i) => (
              <li key={dest.id} role="option" aria-selected={highlightedIndex === i}>
                <button
                  type="button"
                  id={`dropdown-option-${i}`}
                  data-dropdown-index={i}
                  onClick={() => handleSelectDestination(dest)}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  className={`w-full px-3 py-2.5 rounded-lg text-left flex items-center gap-2 active:scale-[0.99] transition-transform ${highlightedIndex === i ? 'bg-p2p-blue/10' : 'hover:bg-gray-50'}`}
                >
                  <MapPin size={18} className="text-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{dest.name}</div>
                    {dest.address && <div className="text-xs text-gray-500 truncate">{dest.address}</div>}
                  </div>
                  <ArrowRight size={16} className="text-gray-300 shrink-0 ml-auto" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {showDropdownFocusedEmpty && (
        <div className="space-y-4">
          <section aria-labelledby="recent-heading">
            <div className="flex items-center justify-between mb-1 px-2">
              <h3 id="recent-heading" className="text-xs font-bold text-gray-400 uppercase tracking-wider">Recent Searches</h3>
              {recentSearches.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearRecent}
                  className="text-xs font-semibold text-p2p-blue hover:underline flex items-center gap-1"
                >
                  <X size={14} /> Clear
                </button>
              )}
            </div>
            {recentSearches.length > 0 ? (
              <ul className="space-y-1" role="listbox" aria-label="Recent searches" aria-activedescendant={selectableItems.length ? `dropdown-option-${highlightedIndex}` : undefined}>
                {recentSearches.map((item, i) => (
                  <li key={`${item.label}-${item.timestamp}`} role="option" aria-selected={highlightedIndex === i}>
                    <button
                      type="button"
                      id={`dropdown-option-${i}`}
                      data-dropdown-index={i}
                      onClick={() => handleSelectRecent(item)}
                      onMouseEnter={() => setHighlightedIndex(i)}
                      className={`w-full px-3 py-2.5 rounded-lg flex items-center gap-3 text-left active:scale-[0.99] transition-transform ${highlightedIndex === i ? 'bg-p2p-blue/10' : 'hover:bg-gray-50'}`}
                    >
                      <History size={18} className="text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{item.label}</div>
                        {item.address && <div className="text-xs text-gray-500 truncate">{item.address}</div>}
                      </div>
                      <ArrowRight size={16} className="text-gray-300 shrink-0 ml-auto" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400 px-2 py-1">No recent searches</p>
            )}
          </section>
          <section aria-labelledby="top-locations-heading">
            <h3 id="top-locations-heading" className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-2">Top Locations</h3>
            <ul className="space-y-1" role="listbox" aria-label="Top locations" aria-activedescendant={selectableItems.length ? `dropdown-option-${highlightedIndex}` : undefined}>
              {TOP_DESTINATIONS.map((dest, i) => {
                const idx = recentSearches.length + i;
                return (
                  <li key={dest.id} role="option" aria-selected={highlightedIndex === idx}>
                    <button
                      type="button"
                      id={`dropdown-option-${idx}`}
                      data-dropdown-index={idx}
                      onClick={() => handleSelectDestination(dest)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`w-full px-3 py-2.5 rounded-lg text-left flex items-center gap-2 active:scale-[0.99] transition-transform ${highlightedIndex === idx ? 'bg-p2p-blue/10' : 'hover:bg-gray-50'}`}
                    >
                      <MapPin size={18} className="text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{dest.name}</div>
                        {dest.address && <div className="text-xs text-gray-500 truncate">{dest.address}</div>}
                      </div>
                      <ArrowRight size={16} className="text-gray-300 shrink-0 ml-auto" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
      {showDropdownFocusedQuery && (
        <div className="space-y-4">
          <div>
            <h3 id="top-locations-heading" className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-2">Top Locations</h3>
            {topLocationSuggestions.length > 0 ? (
              <ul className="space-y-1" role="listbox" aria-label="Top locations" aria-activedescendant={selectableItems.length ? `dropdown-option-${highlightedIndex}` : undefined}>
                {topLocationSuggestions.map((dest, i) => (
                  <li key={dest.id} role="option" aria-selected={highlightedIndex === i}>
                    <button
                      type="button"
                      id={`dropdown-option-${i}`}
                      data-dropdown-index={i}
                      onClick={() => handleSelectDestination(dest)}
                      onMouseEnter={() => setHighlightedIndex(i)}
                      className={`w-full px-3 py-2.5 rounded-lg text-left flex items-center gap-2 active:scale-[0.99] transition-transform ${highlightedIndex === i ? 'bg-p2p-blue/10' : 'hover:bg-gray-50'}`}
                    >
                      <MapPin size={18} className="text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{dest.name}</div>
                        {dest.address && <div className="text-xs text-gray-500 truncate">{dest.address}</div>}
                      </div>
                      <ArrowRight size={16} className="text-gray-300 shrink-0 ml-auto" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 px-2">No top locations match.</p>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1 px-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Address Results</h3>
              {geocodeLoading && <span className="text-[11px] text-gray-400">Searching…</span>}
            </div>
            {addressResults.length > 0 ? (
              <ul className="space-y-1" role="listbox" aria-label="Address results" aria-activedescendant={selectableItems.length ? `dropdown-option-${highlightedIndex}` : undefined}>
                {addressResults.map((item, i) => {
                  const idx = topLocationSuggestions.length + i;
                  return (
                  <li key={item.id} role="option" aria-selected={highlightedIndex === idx}>
                    <button
                      type="button"
                      id={`dropdown-option-${idx}`}
                      data-dropdown-index={idx}
                      onClick={() => handleSelectAddressResult(item)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`w-full px-3 py-2.5 rounded-lg text-left flex items-center gap-2 active:scale-[0.99] transition-transform ${highlightedIndex === idx ? 'bg-p2p-blue/10' : 'hover:bg-gray-50'}`}
                    >
                      <MapPin size={18} className="text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{item.place_name.split(',')[0]}</div>
                        <div className="text-xs text-gray-500 truncate">{item.place_name}</div>
                      </div>
                      <ArrowRight size={16} className="text-gray-300 shrink-0 ml-auto" />
                    </button>
                  </li>
                  );
                })}
              </ul>
            ) : !geocodeLoading && query.trim().length >= 3 && (
              <p className="text-sm text-gray-500 px-2">No address results.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-gray-50 p-4">
      <div className="mb-2 mt-2">
        <h2 className="text-2xl font-black text-gray-900 mb-4">Plan Trip</h2>

        {/* Search widget — own card; when focused, no bottom rounding so dropdown attaches */}
        <div className={`bg-white shadow-sm border border-gray-200 overflow-visible ${showDropdownUnfocused ? 'rounded-xl' : 'rounded-t-xl border-b-0'}`}>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10" size={20} aria-hidden />
            <input
              id="plan-trip-destination"
              type="text"
              autoComplete="off"
              placeholder="Where do you want to go?"
              aria-label="Destination search"
              aria-expanded={searchFocused || showDropdownUnfocused}
              aria-haspopup="listbox"
              className="w-full bg-transparent pl-12 pr-4 py-4 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-p2p-blue focus:ring-inset placeholder-gray-400 border-0 rounded-t-xl"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current); blurTimerRef.current = null; setSearchFocused(true); }}
              onBlur={() => { blurTimerRef.current = setTimeout(() => setSearchFocused(false), 200); }}
              onKeyDown={handleSearchKeyDown}
            />
            {!showDropdownUnfocused && (
              <div className="absolute top-full left-0 right-0 z-50 bg-white rounded-b-xl shadow-lg border border-t border-gray-200 overflow-hidden">
                {dropdownContent}
              </div>
            )}
          </div>
        </div>

        {/* Top Destinations widget — separate card when dropdown is closed */}
        {showDropdownUnfocused && (
          <div className="mt-4 sm:mt-5 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Top Destinations</h3>
              <ul className="space-y-1" role="listbox" aria-label="Top destinations" aria-activedescendant={selectableItems.length ? `dropdown-option-${highlightedIndex}` : undefined}>
                {TOP_DESTINATIONS.map((dest, i) => (
                  <li key={dest.id} role="option" aria-selected={highlightedIndex === i}>
                    <button
                      type="button"
                      id={`dropdown-option-${i}`}
                      data-dropdown-index={i}
                      onClick={() => handleSelectDestination(dest)}
                      onMouseEnter={() => setHighlightedIndex(i)}
                      className={`w-full px-3 py-2.5 rounded-lg text-left flex items-center gap-2 active:scale-[0.99] transition-transform ${highlightedIndex === i ? 'bg-p2p-blue/10' : 'hover:bg-gray-50'}`}
                    >
                      <MapPin size={18} className="text-gray-400 shrink-0" />
                      <div className="min-w-0 overflow-hidden">
                        <div className="font-medium text-gray-900 truncate">{dest.name}</div>
                        {dest.address && <div className="text-xs text-gray-500 truncate">{dest.address}</div>}
                      </div>
                      <ArrowRight size={16} className="text-gray-300 shrink-0 ml-auto" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 pb-20" />
    </div>
  );
};

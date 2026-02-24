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
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // const base = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_OPS_API_URL) || '';
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

  const showPopularAndRecent = searchFocused && query.trim().length === 0;

  const refreshRecent = useCallback(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  const handleSelectDestination = useCallback(
    async (dest: Destination) => {
      setQuery(dest.name);
      setSearchFocused(false);
      addRecentSearch({ label: dest.name, lat: dest.lat, lon: dest.lon });
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
      addRecentSearch({ label: dest.name, lat: dest.lat, lon: dest.lon });
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
            <div className="text-sm text-gray-600 mb-2">
              <span className="font-semibold">ETA:</span>{' '}
              <span>{formatETA(totalDurationSeconds)}</span>
            </div>
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
                {idx !== journey.segments.length - 1 && (
                  <div className={`absolute left-[15px] top-8 bottom-[-24px] w-1 ${seg.type === 'bus' ? 'bg-p2p-blue' : 'border-l-2 border-dashed border-gray-300 ml-[3px]'}`} />
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
  return (
    <div className="flex flex-col h-full bg-gray-50 p-4">
      <div className="mb-4 mt-2">
        <h2 className="text-2xl font-black text-gray-900 mb-4">Plan Trip</h2>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={20} aria-hidden />
          <input 
            id="plan-trip-destination"
            type="text" 
            autoComplete="off"
            placeholder="Where do you want to go?"
            aria-label="Destination search"
            aria-describedby={query.trim() ? "top-locations-heading" : showPopularAndRecent ? "popular-heading" : undefined}
            className="w-full bg-white pl-12 pr-4 py-4 rounded-xl shadow-sm border border-gray-200 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-p2p-blue focus:border-transparent placeholder-gray-400"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current); blurTimerRef.current = null; setSearchFocused(true); }}
            onBlur={() => { blurTimerRef.current = setTimeout(() => setSearchFocused(false), 200); }}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-20" style={{ WebkitOverflowScrolling: 'touch' }}>
        {query.trim().length > 0 ? (
          <div className="space-y-6">
            <div>
              <h3 id="top-locations-heading" className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
                Top Locations
              </h3>
              {topLocationSuggestions.length > 0 ? (
                <ul className="space-y-2 max-h-[40vh] overflow-y-auto" role="listbox" aria-label="Top locations" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {topLocationSuggestions.map((dest) => (
                    <li key={dest.id} role="option">
                      <button
                        type="button"
                        onClick={() => handleSelectDestination(dest)}
                        className="w-full bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between group active:scale-[0.99] transition-transform text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-gray-100 text-gray-500 group-hover:bg-p2p-blue/10 group-hover:text-p2p-blue transition-colors">
                            <MapPin size={20} />
                          </div>
                          <div>
                            <div className="font-bold text-gray-900">{dest.name}</div>
                            {dest.address && <div className="text-sm text-gray-500">{dest.address}</div>}
                          </div>
                        </div>
                        <ArrowRight size={20} className="text-gray-300" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500 ml-1">No top locations match.</p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1 ml-1">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Address Results</h3>
                {geocodeLoading && <span className="text-[11px] text-gray-400">Searching…</span>}
              </div>
              {addressResults.length > 0 ? (
                <ul className="space-y-2 max-h-[40vh] overflow-y-auto" role="listbox" aria-label="Address results" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {addressResults.map((item) => (
                    <li key={item.id} role="option">
                      <button
                        type="button"
                        onClick={() => handleSelectAddressResult(item)}
                        className="w-full bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between group active:scale-[0.99] transition-transform text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-gray-100 text-gray-500 group-hover:bg-p2p-blue/10 group-hover:text-p2p-blue transition-colors">
                            <MapPin size={20} />
                          </div>
                          <div>
                            <div className="font-bold text-gray-900">{item.place_name.split(',')[0]}</div>
                            <div className="text-sm text-gray-500">{item.place_name}</div>
                          </div>
                        </div>
                        <ArrowRight size={20} className="text-gray-300" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : !geocodeLoading && query.trim().length >= 3 && (
                <p className="text-sm text-gray-500 ml-1">No address results.</p>
              )}
            </div>
          </div>
        ) : showPopularAndRecent ? (
          <div className="space-y-6">
            {recentSearches.length > 0 && (
              <section aria-labelledby="recent-heading">
                <div className="flex items-center justify-between mb-2 ml-1">
                  <h3 id="recent-heading" className="text-xs font-bold text-gray-400 uppercase tracking-wider">Recent</h3>
                  <button
                    type="button"
                    onClick={handleClearRecent}
                    className="text-xs font-semibold text-p2p-blue hover:underline flex items-center gap-1"
                  >
                    <X size={14} /> Clear
                  </button>
                </div>
                <ul className="space-y-2" role="listbox" aria-label="Recent searches">
                  {recentSearches.map((item, i) => (
                    <li key={`${item.label}-${item.timestamp}`} role="option">
                      <button
                        type="button"
                        onClick={() => handleSelectRecent(item)}
                        className="w-full bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
                      >
                        <div className="p-2 rounded-full bg-gray-100 text-gray-500">
                          <History size={20} />
                        </div>
                        <span className="font-bold text-gray-900">{item.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section aria-labelledby="popular-heading">
              <h3 id="popular-heading" className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Top Locations</h3>
              <ul className="space-y-2 max-h-[50vh] overflow-y-auto" role="listbox" aria-label="Top locations" style={{ WebkitOverflowScrolling: 'touch' }}>
                {TOP_DESTINATIONS.map((dest) => (
                  <li key={dest.id} role="option">
                    <button 
                      type="button"
                      onClick={() => handleSelectDestination(dest)}
                      className="w-full bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between group active:scale-[0.99] transition-transform text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-gray-100 text-gray-500 group-hover:bg-p2p-blue/10 group-hover:text-p2p-blue transition-colors">
                          <MapPin size={20} />
                        </div>
                        <div>
                          <div className="font-bold text-gray-900">{dest.name}</div>
                          {dest.address && <div className="text-sm text-gray-500">{dest.address}</div>}
                        </div>
                      </div>
                      <ArrowRight size={20} className="text-gray-300" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : query.trim().length === 0 ? (
           <div className="text-center py-10 opacity-60">
             <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
               <Navigation size={32} />
             </div>
             <p className="text-gray-500 font-medium">Search for a UNC building<br/>or landmark to start.</p>
           </div>
        ) : (
          <div className="text-center py-10 text-gray-500">No locations found.</div>
        )}
      </div>
    </div>
  );
};

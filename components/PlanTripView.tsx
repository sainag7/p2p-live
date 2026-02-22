import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Search, MapPin, ArrowRight, Bus, User, Navigation, History, X } from 'lucide-react';
import { Destination, Journey, Coordinate } from '../types';
import { MOCK_DESTINATIONS } from '../data/mockTransit';
import { POPULAR_LOCATIONS } from '../data/popularLocations';
import { getRecentSearches, addRecentSearch, clearRecentSearches, type RecentSearchItem } from '../storage/recentSearches';
import { calculateJourney } from '../utils/journey';

// Combined list for typeahead (popular first, then mock; dedupe by id)
const ALL_DESTINATIONS = (() => {
  const byId = new Map<string, Destination>();
  [...POPULAR_LOCATIONS, ...MOCK_DESTINATIONS].forEach(d => byId.set(d.id, d));
  return Array.from(byId.values());
})();

interface PlanTripViewProps {
  userLocation: Coordinate;
  onPlanRoute: (journey: Journey) => void;
  onViewOnMap: () => void;
  existingJourney: Journey | null;
  /** When set (e.g. from map "Route to this stop"), prefill destination and run plan; then clear. */
  pendingDestination?: Destination | null;
  onConsumePendingDestination?: () => void;
}

export const PlanTripView: React.FC<PlanTripViewProps> = ({ 
  userLocation, 
  onPlanRoute, 
  onViewOnMap,
  existingJourney,
  pendingDestination,
  onConsumePendingDestination,
}) => {
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>(() => getRecentSearches());
  const [journey, setJourney] = useState<Journey | null>(existingJourney);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current); }, []);

  // Consume pending destination from map "Route to this stop" deep-link
  useEffect(() => {
    if (!pendingDestination || !onConsumePendingDestination) return;
    const dest = pendingDestination;
    onConsumePendingDestination();
    setQuery(dest.name);
    setSearchFocused(false);
    addRecentSearch({ label: dest.name, lat: dest.lat, lon: dest.lon });
    setRecentSearches(getRecentSearches());
    try {
      const newJourney = calculateJourney(userLocation, dest);
      setJourney(newJourney);
      onPlanRoute(newJourney);
    } catch (e) {
      console.error(e);
      alert('Could not calculate route');
    }
  }, [pendingDestination, userLocation, onPlanRoute, onConsumePendingDestination]);

  const suggestions = useMemo(() => {
    if (query.trim().length === 0) return [];
    const q = query.toLowerCase();
    return ALL_DESTINATIONS.filter(
      d =>
        d.name.toLowerCase().includes(q) ||
        (d.address?.toLowerCase().includes(q))
    );
  }, [query]);

  const showPopularAndRecent = searchFocused && query.trim().length === 0;

  const refreshRecent = useCallback(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  const handleSelectDestination = useCallback((dest: Destination) => {
    setQuery(dest.name);
    setSearchFocused(false);
    addRecentSearch({ label: dest.name, lat: dest.lat, lon: dest.lon });
    refreshRecent();
    try {
      const newJourney = calculateJourney(userLocation, dest);
      setJourney(newJourney);
      onPlanRoute(newJourney);
    } catch (e) {
      console.error(e);
      alert('Could not calculate route');
    }
  }, [userLocation, onPlanRoute, refreshRecent]);

  const handleSelectRecent = useCallback((item: RecentSearchItem) => {
    const dest: Destination = item.lat != null && item.lon != null
      ? { id: `recent-${item.label}`, name: item.label, lat: item.lat, lon: item.lon }
      : ALL_DESTINATIONS.find(d => d.name.toLowerCase() === item.label.toLowerCase()) ?? { id: `recent-${item.label}`, name: item.label, lat: 35.91, lon: -79.05 };
    setQuery(dest.name);
    setSearchFocused(false);
    addRecentSearch({ label: dest.name, lat: dest.lat, lon: dest.lon });
    refreshRecent();
    try {
      const newJourney = calculateJourney(userLocation, dest);
      setJourney(newJourney);
      onPlanRoute(newJourney);
    } catch (e) {
      console.error(e);
      alert('Could not calculate route');
    }
  }, [userLocation, onPlanRoute, refreshRecent]);

  const handleClearRecent = useCallback(() => {
    clearRecentSearches();
    setRecentSearches([]);
  }, []);

  const handleNewSearch = () => {
    setQuery('');
    setJourney(null);
    onPlanRoute(null as any); // Clear journey in parent
  };

  // Render Result View
  if (journey) {
    return (
      <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
        {/* Journey Summary Header */}
        <div className="bg-white p-5 border-b border-gray-100 shadow-sm shrink-0">
            <h2 className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Total Time</h2>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-black text-gray-900">{journey.totalDurationMin}</span>
              <span className="text-xl font-medium text-gray-500">min</span>
            </div>
            
            <div className="flex flex-wrap gap-2 mb-4">
               {journey.segments.map((seg, i) => (
                 <div key={i} className={`flex items-center text-xs font-bold px-2 py-1 rounded-md border ${
                   seg.type === 'walk' ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-p2p-blue/10 text-p2p-blue border-p2p-blue/20'
                 }`}>
                   {seg.type === 'walk' ? <User size={12} className="mr-1"/> : <Bus size={12} className="mr-1"/>}
                   {seg.durationMin} min
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
                     <span className="text-sm font-semibold text-gray-500 whitespace-nowrap">{seg.durationMin} min</span>
                   </div>
                   
                   {seg.type === 'bus' && (
                     <div className="mt-2">
                        <div className="inline-block bg-p2p-blue text-white text-xs font-bold px-2 py-0.5 rounded mb-2">
                          {seg.routeName}
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <div className="flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-gray-300 mr-2"/> Board at {seg.fromName}</div>
                          <div className="flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-gray-300 mr-2"/> Get off at {seg.toName}</div>
                          <div className="text-xs text-gray-400 mt-1 pl-3.5">{seg.stopsCount} stops • Arrives in {seg.waitTimeMin} min</div>
                        </div>
                     </div>
                   )}

                   {seg.type === 'walk' && (
                     <div className="text-sm text-gray-500">
                       Walk {Math.round(seg.distanceMeters)} meters
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
            aria-describedby={suggestions.length ? "suggestions-heading" : showPopularAndRecent ? "popular-heading" : undefined}
            className="w-full bg-white pl-12 pr-4 py-4 rounded-xl shadow-sm border border-gray-200 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-p2p-blue focus:border-transparent placeholder-gray-400"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current); blurTimerRef.current = null; setSearchFocused(true); }}
            onBlur={() => { blurTimerRef.current = setTimeout(() => setSearchFocused(false), 200); }}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-20" style={{ WebkitOverflowScrolling: 'touch' }}>
        {suggestions.length > 0 ? (
          <div className="space-y-2">
            <h3 id="suggestions-heading" className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Suggestions</h3>
            <ul className="space-y-2 max-h-[50vh] overflow-y-auto" role="listbox" aria-label="Search suggestions" style={{ WebkitOverflowScrolling: 'touch' }}>
              {suggestions.map(dest => (
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
              <h3 id="popular-heading" className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Popular</h3>
              <ul className="space-y-2 max-h-[50vh] overflow-y-auto" role="listbox" aria-label="Popular locations" style={{ WebkitOverflowScrolling: 'touch' }}>
                {POPULAR_LOCATIONS.map(dest => (
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

import React, { useState, useEffect } from 'react';
import { Search, MapPin, ArrowRight, Bus, User, Clock, Navigation } from 'lucide-react';
import { Destination, Journey, Coordinate } from '../types';
import { MOCK_DESTINATIONS } from '../data/mockTransit';
import { calculateJourney } from '../utils/journey';

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
  const [suggestions, setSuggestions] = useState<Destination[]>([]);
  const [journey, setJourney] = useState<Journey | null>(existingJourney);

  // Filter suggestions
  useEffect(() => {
    if (query.length > 0) {
      const filtered = MOCK_DESTINATIONS.filter(d => 
        d.name.toLowerCase().includes(query.toLowerCase()) ||
        d.address?.toLowerCase().includes(query.toLowerCase())
      );
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  }, [query]);

  const handleSelectDestination = (dest: Destination) => {
    setQuery(dest.name);
    setSuggestions([]);
    try {
      const newJourney = calculateJourney(userLocation, dest);
      setJourney(newJourney);
      onPlanRoute(newJourney);
    } catch (e) {
      console.error(e);
      alert('Could not calculate route');
    }
  };

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
      <div className="mb-6 mt-2">
        <h2 className="text-2xl font-black text-gray-900 mb-4">Plan Trip</h2>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Where do you want to go?"
            className="w-full bg-white pl-12 pr-4 py-4 rounded-xl shadow-sm border border-gray-200 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-p2p-blue focus:border-transparent placeholder-gray-400"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-20">
        {suggestions.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Suggestions</h3>
            {suggestions.map(dest => (
              <button 
                key={dest.id}
                onClick={() => handleSelectDestination(dest)}
                className="w-full bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between group active:scale-[0.99] transition-transform text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-gray-100 text-gray-500 group-hover:bg-p2p-blue/10 group-hover:text-p2p-blue transition-colors">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">{dest.name}</div>
                    <div className="text-sm text-gray-500">{dest.address}</div>
                  </div>
                </div>
                <ArrowRight size={20} className="text-gray-300" />
              </button>
            ))}
          </div>
        ) : query.length === 0 ? (
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

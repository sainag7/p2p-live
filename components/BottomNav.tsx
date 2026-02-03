import React from 'react';
import { Map, List, Navigation2 } from 'lucide-react';
import { ViewState } from '../types';

interface BottomNavProps {
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentView, onChangeView }) => {
  return (
    <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-16 flex z-50 safe-area-bottom shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      <button
        onClick={() => onChangeView('list')}
        className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
          currentView === 'list' ? 'text-p2p-blue' : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        <List size={24} strokeWidth={currentView === 'list' ? 2.5 : 2} />
        <span className="text-xs font-medium">List</span>
      </button>

      <div className="w-px bg-gray-100 h-8 self-center" />

      <button
        onClick={() => onChangeView('plan')}
        className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
          currentView === 'plan' ? 'text-p2p-blue' : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        <div className={`p-1 rounded-full ${currentView === 'plan' ? 'bg-p2p-blue/10' : ''}`}>
             <Navigation2 size={24} strokeWidth={currentView === 'plan' ? 2.5 : 2} className={currentView === 'plan' ? 'fill-p2p-blue/20' : ''}/>
        </div>
        <span className="text-xs font-medium">Plan Trip</span>
      </button>

      <div className="w-px bg-gray-100 h-8 self-center" />

      <button
        onClick={() => onChangeView('map')}
        className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
          currentView === 'map' ? 'text-p2p-blue' : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        <Map size={24} strokeWidth={currentView === 'map' ? 2.5 : 2} />
        <span className="text-xs font-medium">Map</span>
      </button>
    </div>
  );
};

import React from 'react';
import { Map, List, Navigation2 } from 'lucide-react';
import { ViewState } from '../types';

interface BottomNavProps {
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
}

const NAV_ICON_SIZE = 24;
const NAV_LABEL_CLASS = 'text-xs font-medium leading-tight';

export const BottomNav: React.FC<BottomNavProps> = ({ currentView, onChangeView }) => {
  return (
    <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-16 flex z-50 safe-area-bottom shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      <button
        onClick={() => onChangeView('list')}
        className="flex-1 flex flex-col items-center justify-center gap-1 min-h-0 transition-colors hover:opacity-90"
        aria-current={currentView === 'list' ? 'page' : undefined}
      >
        <div className="h-7 w-7 flex items-center justify-center shrink-0">
          <List size={NAV_ICON_SIZE} strokeWidth={currentView === 'list' ? 2.5 : 2} className={currentView === 'list' ? 'text-p2p-blue' : 'text-gray-400'} />
        </div>
        <span className={`shrink-0 ${NAV_LABEL_CLASS} ${currentView === 'list' ? 'text-p2p-blue' : 'text-gray-400'}`}>Buses</span>
      </button>

      <div className="w-px bg-gray-100 h-8 self-center shrink-0" />

      <button
        onClick={() => onChangeView('plan')}
        className="flex-1 flex flex-col items-center justify-center gap-1 min-h-0 transition-colors hover:opacity-90"
        aria-current={currentView === 'plan' ? 'page' : undefined}
      >
        <div className={`h-7 w-7 flex items-center justify-center shrink-0 rounded-full ${currentView === 'plan' ? 'bg-p2p-blue/10' : ''}`}>
          <Navigation2 size={NAV_ICON_SIZE} strokeWidth={currentView === 'plan' ? 2.5 : 2} className={currentView === 'plan' ? 'text-p2p-blue fill-p2p-blue/20' : 'text-gray-400'} />
        </div>
        <span className={`shrink-0 ${NAV_LABEL_CLASS} ${currentView === 'plan' ? 'text-p2p-blue' : 'text-gray-400'}`}>Plan Trip</span>
      </button>

      <div className="w-px bg-gray-100 h-8 self-center shrink-0" />

      <button
        onClick={() => onChangeView('map')}
        className="flex-1 flex flex-col items-center justify-center gap-1 min-h-0 transition-colors hover:opacity-90"
        aria-current={currentView === 'map' ? 'page' : undefined}
      >
        <div className="h-7 w-7 flex items-center justify-center shrink-0">
          <Map size={NAV_ICON_SIZE} strokeWidth={currentView === 'map' ? 2.5 : 2} className={currentView === 'map' ? 'text-p2p-blue' : 'text-gray-400'} />
        </div>
        <span className={`shrink-0 ${NAV_LABEL_CLASS} ${currentView === 'map' ? 'text-p2p-blue' : 'text-gray-400'}`}>Map</span>
      </button>
    </div>
  );
};

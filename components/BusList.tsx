import React from 'react';
import { Vehicle, Stop } from '../types';
import { Bus, ChevronRight } from 'lucide-react';

interface BusListProps {
  vehicles: Vehicle[];
  stops: Stop[];
  onSelectBus: (bus: Vehicle) => void;
}

export const BusList: React.FC<BusListProps> = ({ vehicles, stops, onSelectBus }) => {
  const getStopName = (id: string) => stops.find(s => s.id === id)?.name || 'Unknown Stop';

  return (
    <div className="px-4 pb-24 pt-2">
      <div className="space-y-3">
        {vehicles.map((bus) => (
          <button
            key={bus.id}
            onClick={() => onSelectBus(bus)}
            className="w-full bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between active:scale-[0.98] transition-transform text-left"
          >
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-full ${bus.routeId === 'p2p-express' ? 'bg-p2p-blue/10 text-p2p-blue' : 'bg-p2p-red/10 text-p2p-red'}`}>
                <Bus size={24} />
              </div>
              <div>
                <div className="font-bold text-gray-900">{bus.routeName}</div>
                <div className="text-sm text-gray-500 mt-0.5">
                  Next: {getStopName(bus.nextStopId)}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="font-bold text-gray-900">{bus.nextStopEtaMin} min</div>
                <div className="text-xs text-gray-400">Arrival</div>
              </div>
              <ChevronRight size={20} className="text-gray-300" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

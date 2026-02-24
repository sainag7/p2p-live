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
              className="w-full bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between gap-2 active:scale-[0.98] transition-transform text-left min-w-0"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className={`p-3 rounded-full shrink-0 ${
                    bus.routeId === 'p2p-express'
                      ? 'bg-p2p-blue/10 text-p2p-blue'
                      : 'bg-p2p-red/10 text-p2p-red'
                  }`}
                >
                  <Bus size={24} />
                </div>
                <div className="min-w-0 overflow-hidden">
                  <div className="font-bold text-gray-900 truncate">{bus.routeName}</div>
                  <div className="text-sm text-gray-500 mt-0.5 leading-snug overflow-hidden line-clamp-2">
                    Next: {getStopName(bus.nextStopId)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 min-w-[64px]">
                <div className="text-right whitespace-nowrap">
                  <div className="font-bold text-gray-900">{bus.nextStopEtaMin} min</div>
                  <div className="text-xs text-gray-400">Arrival</div>
                </div>
                <ChevronRight size={20} className="text-gray-300 shrink-0" />
              </div>
            </button>
        ))}
      </div>
    </div>
  );
};

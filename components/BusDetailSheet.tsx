import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Coordinate, LiveVehicle, Stop } from '../types';
import { X, Navigation, ChevronDown, ChevronUp } from 'lucide-react';
import { getDistanceMeters, getWalkTimeMinutes } from '../utils/geo';
import { formatEta } from '../utils/format';
import { getLoadInfo } from '../utils/vehicleDisplay';
import { getPattern } from '../utils/transitSelectors';
import { useTransit } from '../context/TransitProvider';

/** Stops listed up front, and how many more "View next stops" reveals. */
const FIRST_STOPS = 5;
const MORE_STOPS = 10;

function getFullnessMeta(percent: number): { label: string; textClass: string; barClass: string } {
  if (percent <= 30) return { label: 'Low', textClass: 'text-emerald-600', barClass: 'bg-emerald-500' };
  if (percent <= 70) return { label: 'Moderate', textClass: 'text-yellow-600', barClass: 'bg-yellow-400' };
  if (percent <= 90) return { label: 'High', textClass: 'text-orange-600', barClass: 'bg-orange-500' };
  return { label: 'Near Capacity', textClass: 'text-red-600', barClass: 'bg-red-500' };
}

interface BusDetailSheetProps {
  vehicle: LiveVehicle;
  stops: Stop[];
  userLocation: Coordinate | null;
  onClose: () => void;
}

export const BusDetailSheet: React.FC<BusDetailSheetProps> = ({ vehicle, stops, userLocation, onClose }) => {
  const { network } = useTransit();
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const stopsById = useMemo(() => new Map(stops.map((s) => [s.id, s])), [stops]);
  const orderedStopIds = useMemo(
    () => getPattern(network, vehicle.patternId)?.stops.map((s) => s.stopId) ?? [],
    [network, vehicle.patternId]
  );

  const nextStop = vehicle.nextStopId ? stopsById.get(vehicle.nextStopId) ?? null : null;
  const walkToNextStop = useMemo(
    () => (nextStop && userLocation ? getWalkTimeMinutes(getDistanceMeters(userLocation, nextStop)) : null),
    [nextStop, userLocation]
  );

  const [showMore, setShowMore] = useState(false);
  useEffect(() => setShowMore(false), [vehicle.id]);
  const loadInfo = getLoadInfo(vehicle);
  const fullnessMeta = loadInfo ? getFullnessMeta(loadInfo.percent) : null;

  const upcoming = useMemo(() => {
    const nameOf = (id: string) => stopsById.get(id)?.name ?? 'Unknown stop';
    return vehicle.upcomingStops.map((stop, idx) => {
      let previousStopId: string | null = null;
      if (idx > 0) {
        previousStopId = vehicle.upcomingStops[idx - 1].stopId;
      } else {
        const i = orderedStopIds.indexOf(stop.stopId);
        if (i !== -1 && orderedStopIds.length > 1) {
          previousStopId = orderedStopIds[(i - 1 + orderedStopIds.length) % orderedStopIds.length];
        }
      }
      const minutesFromPrevious =
        idx > 0 ? Math.max(1, Math.round((stop.etaSec - vehicle.upcomingStops[idx - 1].etaSec) / 60)) : null;
      return {
        ...stop,
        name: nameOf(stop.stopId),
        previousStopName: previousStopId ? nameOf(previousStopId) : null,
        minutesFromPrevious,
      };
    });
  }, [vehicle.upcomingStops, orderedStopIds, stopsById]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center sm:justify-center pointer-events-none" onKeyDown={e => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const buttons = sheetRef.current?.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]');
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }}>
      <div
        className="absolute inset-0 bg-black/30 pointer-events-auto"
        onClick={onClose}
      />
      <div
        className="bus-detail-sheet w-full sm:max-w-md z-50 pointer-events-auto max-h-[85vh] flex flex-col animate-slide-up sm:m-4"
        ref={sheetRef} role="dialog" aria-modal="true" aria-label={`${vehicle.routeName} bus details`}
        style={{ minHeight: 0 }}
      >
        <div className="shrink-0">
          <div className="w-full flex justify-center pt-2 pb-1 sm:hidden">
            <div className="w-9 h-[5px] rounded-full bg-black/15" />
          </div>
          <div className="px-5 pt-2 pb-0 flex justify-between items-start gap-3">
            <div className="min-w-0">
              <h2 className="text-[22px] font-bold tracking-tight text-black truncate">{vehicle.routeName}</h2>
              <p className="text-[15px] text-black/40 mt-0.5">{vehicle.name}</p>
            </div>
            <button
              ref={closeRef}
              onClick={onClose}
              className="bus-detail-close"
              aria-label="Close"
            >
              <X size={16} className="text-black/50" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-6" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="bus-detail-summary mb-5 p-4">
            <div className="flex items-center gap-2.5 mb-3">
              <div className={`w-2 h-2 rounded-full ${vehicle.stale ? 'bg-[#aeaeb2]' : 'bg-[#34c759]'}`} />
              <span className="text-[15px] font-medium text-black/60">
                {vehicle.stale ? (
                  'Location not updating'
                ) : nextStop ? (
                  <>
                    En route to <span className="text-black font-semibold">{nextStop.name}</span>
                  </>
                ) : (
                  'Next stop unknown'
                )}
              </span>
            </div>

            <div className="flex justify-between items-end mb-3">
              <div>
                <div className="bus-detail-eta text-black">{formatEta(vehicle.nextStopEtaSec)}</div>
                <div className="text-[13px] text-black/40 mt-0.5">Estimated arrival</div>
              </div>
              {walkToNextStop !== null && (
                <div className="text-right">
                  <div className="flex items-center justify-end text-[#007aff] gap-1">
                    <Navigation size={14} />
                    <span className="font-semibold text-[17px] tabular-nums">{walkToNextStop} min</span>
                  </div>
                  <div className="text-[13px] text-black/40">Walk to stop</div>
                </div>
              )}
            </div>

            {loadInfo && fullnessMeta && (
              <div>
                <div className="flex items-center justify-between text-[13px] text-black/40 mb-1.5">
                  <span>Fullness</span>
                  <span className={`font-semibold ${fullnessMeta.textClass}`}>
                    {loadInfo.riders != null && loadInfo.capacity != null
                      ? `${loadInfo.riders} / ${loadInfo.capacity} riders`
                      : `${loadInfo.percent}%`}{' '}
                    ({fullnessMeta.label})
                  </span>
                </div>
                <div className="h-1.5 bg-black/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${fullnessMeta.barClass}`}
                    style={{ width: `${Math.min(100, loadInfo.percent)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2">Upcoming stops</h3>
            {upcoming.length === 0 ? (
              <p className="text-[15px] text-black/40">No upcoming stop predictions for this bus.</p>
            ) : (
              <div className="rounded-2xl bg-[#f2f2f7] overflow-hidden">
                {upcoming.slice(0, showMore ? FIRST_STOPS + MORE_STOPS : FIRST_STOPS).map((stop, idx) => (
                  <div
                    key={`${stop.stopId}-${idx}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 border-b border-black/[0.08] last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <span className={`block text-[15px] font-medium truncate ${idx === 0 ? 'text-black' : 'text-black/60'}`}>
                        {stop.name}
                      </span>
                      {stop.previousStopName && (
                        <span className="block text-[13px] text-black/35 truncate mt-0.5">
                          {stop.minutesFromPrevious == null
                            ? `Previous stop: ${stop.previousStopName}`
                            : `${stop.minutesFromPrevious} min after ${stop.previousStopName}`}
                        </span>
                      )}
                    </div>
                    <span className={`text-[15px] font-semibold tabular-nums whitespace-nowrap ${idx === 0 ? 'text-black' : 'text-black/35'}`}>
                      {formatEta(stop.etaSec)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {upcoming.length > FIRST_STOPS && (
              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                aria-expanded={showMore}
                className="bus-detail-more mt-3 w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-black/[0.06] text-[15px] font-semibold text-[#007aff]"
              >
                {showMore ? 'Hide next stops' : 'View next stops'}
                {showMore ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

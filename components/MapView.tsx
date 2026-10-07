import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box, Compass, ExternalLink, Footprints, List, LocateFixed, Minus, Plus, SlidersHorizontal, X } from 'lucide-react';
import type { MapCamera } from './MapboxMap';
import { MapRenderer } from './MapRenderer';
import { StopPopup } from './StopPopup';
import type { Stop, LiveVehicle, Coordinate, Journey, RouteId } from '../types';
import type { LngLat } from '../utils/routeInterpolation';
import { useTransit } from '../context/TransitProvider';
import { getActivePattern, getRouteStops } from '../utils/transitSelectors';
import { getLiveStatusMessage } from '../utils/liveStatus';
import { eligibleCampusLocation, mergeMapStops, nearbyMapStop, routeArrows } from '../utils/mapPresentation';
import { ROUTE_IDS, ROUTE_NAMES } from '../data/routes';
import { mainWalkingSteps } from '../utils/tripPlanning';
import './campus-map.css';

const ROUTES_PDF = 'https://move.unc.edu/wp-content/uploads/sites/248/2022/08/unc-point-to-point-map.pdf';
interface MapViewProps {
  active: boolean;
  vehicles: LiveVehicle[];
  userLocation: Coordinate;
  userLocationResolved: boolean;
  onSelectBus: (bus: LiveVehicle) => void;
  onSelectStop: (stop: Stop) => void;
  onDismissStop: () => void;
  selectedStop: Stop | null;
  busDetailsOpen: boolean;
  activeJourney?: Journey | null;
  onClearJourney: () => void;
  onStartWalkToStop: (journey: Journey) => void;
  centerOnCampusAt?: number | null;
  topInset?: number;
}
export const MapView: React.FC<MapViewProps> = ({ active, vehicles, userLocation, userLocationResolved, onSelectBus, onSelectStop, onDismissStop, selectedStop, busDetailsOpen, activeJourney = null, onClearJourney, onStartWalkToStop, centerOnCampusAt, topInset = 0 }) => {
  const { network, networkStatus, snapshot, status, snapshotReceivedAt, refresh, refreshing } = useTransit();
  const [enabled, setEnabled] = useState<RouteId[]>([...ROUTE_IDS]);
  const [enable3D, setEnable3D] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [picker, setPicker] = useState<Stop[] | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [nearbyDismissed, setNearbyDismissed] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [toolbarHeight, setToolbarHeight] = useState(90);
  const camera = useRef<MapCamera>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const options = useRef<HTMLDivElement>(null);
  const optionsButton = useRef<HTMLButtonElement>(null);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const journeyHeading = useRef<HTMLHeadingElement>(null);
  const pExpress = getActivePattern(network, snapshot, 'P2P_EXPRESS');
  const pBaity = getActivePattern(network, snapshot, 'BAITY_HILL');
  const routeLines = useMemo<Record<RouteId, LngLat[]>>(() => ({ P2P_EXPRESS: pExpress?.geometry.coordinates ?? [], BAITY_HILL: pBaity?.geometry.coordinates ?? [] }), [pExpress, pBaity]);
  const routeStops = useMemo<Record<RouteId, Stop[]>>(() => ({ P2P_EXPRESS: getRouteStops(network, snapshot, 'P2P_EXPRESS'), BAITY_HILL: getRouteStops(network, snapshot, 'BAITY_HILL') }), [network, pExpress, pBaity]);
  const arrows = useMemo(() => {
    const express = routeArrows(pExpress);
    return { P2P_EXPRESS: express, BAITY_HILL: routeArrows(pBaity, pExpress?.geometry.coordinates, express) };
  }, [pExpress, pBaity]);
  const patternLines = useMemo<Record<number, LngLat[]>>(() => Object.fromEntries(network?.routes.flatMap(r => r.patterns.map(p => [p.id, p.geometry.coordinates])) ?? []), [network]);
  const visibleStops = useMemo(() => mergeMapStops(routeStops, enabled), [routeStops, enabled]);
  const location = useMemo(() => eligibleCampusLocation(userLocation, userLocationResolved), [userLocation, userLocationResolved]);
  const nearby = useMemo(() => nearbyMapStop(location, visibleStops), [location, visibleStops]);
  const shownStop = selectedStop ?? (!nearbyDismissed ? nearby : null);
  const hasSheet = !busDetailsOpen && !!(picker || listOpen || activeJourney || shownStop);
  const controlsTop = topInset + toolbarHeight + 24;
  const insets = useMemo(() => ({ top: topInset + toolbarHeight + 28, bottom: sheetHeight + (hasSheet ? 36 : 30), left: 28, right: 68 }), [topInset, toolbarHeight, sheetHeight, hasSheet]);
  useLayoutEffect(() => {
    const measure = () => { setSheetHeight(sheet.current?.getBoundingClientRect().height ?? 0); setToolbarHeight(toolbar.current?.getBoundingClientRect().height ?? 90); };
    measure(); const observer = new ResizeObserver(measure);
    if (sheet.current) observer.observe(sheet.current); if (toolbar.current) observer.observe(toolbar.current);
    return () => observer.disconnect();
  }, [hasSheet, active]);
  useEffect(() => { if (active && (listOpen || picker) && !busDetailsOpen) panelHeading.current?.focus({ preventScroll: true }); }, [listOpen, picker, busDetailsOpen, active]);
  useEffect(() => {
    if (!optionsOpen || !active) return;
    const outside = (e: PointerEvent) => { if (!options.current?.contains(e.target as Node)) setOptionsOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [optionsOpen, active]);
  useEffect(() => {
    if (selectedStop && !visibleStops.some(s => s.id === selectedStop.id)) onDismissStop();
    setPicker(p => { const remaining = p?.filter(s => visibleStops.some(v => v.id === s.id)); return remaining?.length ? remaining : null; });
  }, [visibleStops]);
  useEffect(() => { if (busDetailsOpen) { setPicker(null); setListOpen(false); setOptionsOpen(false); } }, [busDetailsOpen]);
  useEffect(() => {
    if (selectedStop || activeJourney) { setPicker(null); setListOpen(false); setOptionsOpen(false); }
    if (active && activeJourney) journeyHeading.current?.focus({ preventScroll: true });
  }, [selectedStop?.id, activeJourney?.id, active]);
  const restoreFocus = () => { if (listOpen) optionsButton.current?.focus(); else camera.current?.focus(); };
  const closePanel = () => { restoreFocus(); setPicker(null); setListOpen(false); onDismissStop(); setNearbyDismissed(true); };
  const selectStop = (stop: Stop) => { setPicker(null); setListOpen(false); setOptionsOpen(false); onSelectStop(stop); };
  const choose = (stops: Stop[]) => { onClearJourney(); if (stops.length === 1) selectStop(stops[0]); else { onDismissStop(); setPicker(stops); setListOpen(false); } };
  const toggleRoute = (id: RouteId) => setEnabled(current => current.includes(id) ? current.filter(r => r !== id) : [...current, id]);
  const statusMessage = getLiveStatusMessage(status);
  const stateLabel = status === 'loading' ? 'Connecting to live transit…' : status === 'live' ? `${vehicles.length} ${vehicles.length === 1 ? 'bus' : 'buses'} reporting · Live` : statusMessage?.text;
  const startWalk = (journey: Journey) => { setPicker(null); setListOpen(false); onDismissStop(); onStartWalkToStop(journey); };

  return <div className="campus-map relative w-full h-full" onKeyDown={e => {
    if (e.key !== 'Escape') return;
    if (optionsOpen) { setOptionsOpen(false); optionsButton.current?.focus(); }
    else if (activeJourney) { onClearJourney(); camera.current?.focus(); }
    else if (hasSheet) closePanel();
  }}>
    <MapRenderer cameraRef={camera} active={active} vehicles={vehicles} vehiclesReceivedAt={snapshotReceivedAt} vehiclesFetchedAt={snapshot?.fetchedAt ?? null} routeLines={routeLines} patternLines={patternLines} routeStops={routeStops} routeArrows={arrows} enabledRouteIds={enabled} userLocation={location}
      highlightedStopId={!busDetailsOpen && !picker && !listOpen && !activeJourney ? selectedStop?.id ?? null : null} focusStopId={selectedStop?.id ?? null} viewportInsets={insets} activeJourney={activeJourney}
      onSelectBus={bus => { setPicker(null); setListOpen(false); onDismissStop(); onSelectBus(bus); }} onStopCandidates={choose} onMapClick={() => { if (selectedStop || picker || listOpen) closePanel(); }} enable3D={enable3D} centerOnCampusAt={centerOnCampusAt} />
    <div className="campus-toolbar" ref={toolbar} style={{ top: topInset + 12 }}>
      <div className="campus-chips" role="group" aria-label="Visible routes">{ROUTE_IDS.map(id => <button key={id} type="button" className="campus-chip route-filter" data-route={id} aria-pressed={enabled.includes(id)} onClick={() => toggleRoute(id)}>
        <span className="campus-route-tag" style={{ background: id === 'P2P_EXPRESS' ? '#418fc5' : '#c33934' }} aria-hidden="true">{id === 'P2P_EXPRESS' ? 'EX' : 'BH'}</span>
        <span className="sr-only">{ROUTE_NAMES[id]}</span>
        <span className="campus-count">{status === 'loading' || status === 'unavailable' ? '—' : vehicles.filter(v => v.routeId === id).length}</span>
        <span className="sr-only">{status === 'loading' ? ' loading' : status === 'unavailable' ? ' tracking unavailable' : ` ${ROUTE_NAMES[id]}, ${vehicles.filter(v => v.routeId === id).length} reporting buses`}</span>
      </button>)}</div>
      {stateLabel && <p className={`campus-status ${status === 'live' ? 'live' : ''} ${statusMessage?.tone === 'warning' ? 'warning' : ''}`} role="status"><span className="campus-status-dot" />{stateLabel}</p>}
      {!network && <div className="campus-network-notice">
        <div role="status"><strong>{networkStatus === 'loading' ? 'Loading routes and stops…' : 'Route information unavailable'}</strong>
          {networkStatus === 'unavailable' && <p>We’ll retry automatically. Live bus status is shown separately.</p>}
        </div>
        <button type="button" onClick={() => void refresh()} disabled={networkStatus === 'loading' || refreshing} aria-label="Retry route information">{networkStatus === 'loading' || refreshing ? 'Loading…' : 'Retry'}</button>
      </div>}
    </div>
    <div className="campus-controls" style={{ top: controlsTop }}>
      <div className="relative" ref={options}>
        <button ref={optionsButton} type="button" className="campus-control" aria-label="Map options" aria-expanded={optionsOpen} onClick={() => setOptionsOpen(v => !v)}><SlidersHorizontal size={19} /></button>
        {optionsOpen && <div className="campus-options" role="group" aria-label="Map options">
          <button type="button" aria-pressed={enable3D} onClick={() => { setEnable3D(v => !v); setOptionsOpen(false); optionsButton.current?.focus(); }}><Box size={17} />{enable3D ? 'Return to 2D' : '3D buildings'}</button>
          <button type="button" onClick={() => { onClearJourney(); setListOpen(true); setPicker(null); onDismissStop(); setOptionsOpen(false); }}><List size={17} />Browse stops</button>
          <button type="button" onClick={() => { camera.current?.overview(); setOptionsOpen(false); optionsButton.current?.focus(); }}><Compass size={17} />Campus overview</button>
          <button type="button" onClick={() => { window.open(ROUTES_PDF, '_blank', 'noopener,noreferrer'); setOptionsOpen(false); optionsButton.current?.focus(); }}><ExternalLink size={17} />Route PDF</button>
        </div>}
      </div>
      <button type="button" className="campus-control" aria-label="Zoom in" onClick={() => camera.current?.zoom(1)}><Plus size={19} /></button>
      <button type="button" className="campus-control" aria-label="Zoom out" onClick={() => camera.current?.zoom(-1)}><Minus size={19} /></button>
      <button type="button" className="campus-control" aria-label={location ? 'Recenter on your location' : 'Center on campus'} onClick={() => { setNearbyDismissed(false); camera.current?.recenter(); }}><LocateFixed size={19} /></button>
    </div>
    {hasSheet && <div ref={sheet} className="campus-sheet-wrap">
      {picker || listOpen ? <section className="campus-sheet" aria-label={picker ? 'Choose boarding stop' : 'Campus stop list'}>
        <div className="campus-sheet-heading"><div><h2 ref={panelHeading} tabIndex={-1}>{picker ? 'Choose your stop' : 'Campus stops'}</h2><p className="campus-eyebrow">{picker ? 'Nearby boarding locations' : `${visibleStops.length} stops on visible routes`}</p></div><button type="button" className="campus-close" onClick={closePanel} aria-label="Close stop list"><X size={14} /></button></div>
        {(picker ?? [...visibleStops].sort((a, b) => a.name.localeCompare(b.name))).map(stop => <button key={stop.id} type="button" className="campus-picker" onClick={() => selectStop(stop)}>{stop.name}<small>{visibleStops.find(s => s.id === stop.id)?.routeIds.map(id => ROUTE_NAMES[id]).join(' · ')} · Stop {stop.id}</small></button>)}
        {!visibleStops.length && <p className="campus-hint">{!enabled.length ? 'Select a route above to browse its stops.' : networkStatus === 'unavailable' ? 'Route information unavailable. Use Retry above to load stops.' : networkStatus === 'loading' ? 'Loading routes and stops…' : 'No stops available for these routes.'}</p>}
      </section> : activeJourney ? <section className="campus-sheet" aria-label="Active journey">
        <div className="campus-sheet-heading"><div><h2 ref={journeyHeading} tabIndex={-1}>{activeJourney.destination.name}</h2><p className="campus-eyebrow"><Footprints size={13} />{activeJourney.segments.some(s => s.type === 'bus') ? 'Your journey' : 'Walking directions'}</p></div><button type="button" className="campus-close" aria-label="End journey" onClick={() => { onClearJourney(); camera.current?.focus(); }}><X size={14} /></button></div>
        <p className="campus-hint">{activeJourney.totalDurationMin} min{activeJourney.segments.filter(s => s.type === 'bus').map(s => ` · ${s.routeName}`).join('')}</p>
        {activeJourney.segments.some(s => s.steps?.length) && <details className="mt-3 text-xs"><summary className="cursor-pointer py-2">Walking steps</summary><ol className="list-decimal pl-4 space-y-2 mt-2">{activeJourney.segments.flatMap(s => mainWalkingSteps(s.steps)).map((step, i) => <li key={i}>{step.instruction}</li>)}</ol></details>}
      </section> : shownStop && <StopPopup stop={shownStop} userLocation={location} nearby={!selectedStop} onClose={closePanel} onWalkToStop={startWalk} />}
    </div>}
  </div>;
};

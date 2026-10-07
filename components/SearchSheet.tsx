/**
 * Full-screen search that grows out of whatever opened it (Home's search bar or a starred place):
 * starred, recent and campus places on one tab, the nearest stops with live times on the other,
 * and trip options for a picked place.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, ArrowLeft, Bus, Clock, Footprints, MapPin, Navigation, Search, Star, X } from 'lucide-react';
import type { Coordinate, Destination, Journey, RouteId, Stop } from '../types';
import { useTransit } from '../context/TransitProvider';
import { getActiveStops } from '../utils/transitSelectors';
import { nextArrivalsByRoute } from '../utils/arrivals';
import { findKNearestStops, getDistanceMeters, getWalkTimeMinutes } from '../utils/geo';
import { computeTripOptions } from '../utils/multimodalRouting';
import type { PlannedTrip, TripMode } from '../utils/tripPlanning';
import { CAMPUS_PLACES, highlightMatch, searchCampusPlaces } from '../utils/placeSearch';
import { homeServiceSummary } from '../utils/homePresentation';
import { addRecentSearch, getRecentSearches } from '../storage/recentSearches';
import { samePlace } from '../storage/starredPlaces';
import { geocoder } from '../utils/geocode';
import { RollingNumber } from './RollingNumber';
import { TripResults } from './TripResults';
import { preloadMap } from './MapRenderer';
import './search-sheet.css';

/** What opened the sheet: its on-screen box (the sheet grows from it) and, for a starred place, that place. */
export interface SearchSheetRequest {
  origin: DOMRect;
  label: string;
  place?: Destination;
}

interface SearchSheetProps {
  request: SearchSheetRequest;
  /** Where trips start and stops are measured from. */
  location: Coordinate;
  /** False when location is off or off campus: walk times are hidden and stops are near the Union. */
  locationKnown: boolean;
  starred: Destination[];
  onToggleStar: (place: Destination) => void;
  /** True while the app behind should sit back (scaled and dimmed). */
  onBehindChange: (behind: boolean) => void;
  onSelectStop: (stop: Stop) => void;
  onStartTrip: (journey: Journey) => void;
  /** After the close animation: unmount the sheet. */
  onClosed: () => void;
}

type Phase = 'opening' | 'open' | 'closing';
/** How the current pane arrives: with the sheet, from a tab switch, or pushed/popped by a trip. */
type Enter = 'first' | 'right' | 'left' | 'push' | 'pop' | 'none';

const CLOSE_MS = 220;
const FADE_MS = 180;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const shortRoute = (id: RouteId) => (id === 'P2P_EXPRESS' ? 'Express' : 'Baity Hill');

/** Addresses from Mapbox once the query is long enough, debounced and cancelled as the rider types. */
function useGeocode(query: string, near: Coordinate) {
  const [results, setResults] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (query.length < 3) { setResults([]); setLoading(false); return; }
    const cached = geocoder.cached(query, near);
    if (cached) { setResults(cached); setLoading(false); return; }
    const controller = new AbortController();
    setResults([]);
    setLoading(true);
    const timer = setTimeout(() => {
      geocoder.search(query, near, controller.signal)
        .then(next => { if (!controller.signal.aborted) setResults(next); })
        .catch(err => { if (!controller.signal.aborted && (err as Error).name !== 'AbortError') setResults([]); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 180);
    return () => { controller.abort(); clearTimeout(timer); };
    // Re-query only when the rider moves far enough to change which matches are nearest.
  }, [query, near.lat.toFixed(2), near.lon.toFixed(2)]);
  return { results, loading };
}

interface PlaceRowProps {
  place: Destination;
  icon: 'star' | 'recent' | 'place';
  query: string;
  walk: string | null;
  starred: boolean;
  index: number;
  onPick: () => void;
  onStar: () => void;
}

/** A render function rather than a component: rows are keyed, and this project's JSX types reject keys on components. */
function placeRow({ place, icon, query, walk, starred, index, onPick, onStar }: PlaceRowProps) {
  const name = highlightMatch(place.name, query);
  const Icon = icon === 'recent' ? Clock : icon === 'star' ? Star : MapPin;
  const sub = place.address && place.address !== place.name ? place.address.replace(/, Chapel Hill, NC.*$/, '') : null;
  return <li key={`${icon}-${place.id}`} className="ss-row" style={{ '--i': Math.min(index, 10) } as React.CSSProperties}>
    <button type="button" className="ss-row-main" onClick={onPick}>
      <span className="ss-tile" data-icon={icon}><Icon aria-hidden="true" /></span>
      <span className="ss-row-text">
        <strong>{name.before}{name.match && <mark>{name.match}</mark>}{name.after}</strong>
        {sub && <span>{sub}</span>}
      </span>
      {walk && <span className="ss-row-walk">{walk}</span>}
    </button>
    <button type="button" className="ss-star" aria-pressed={starred} aria-label={`${starred ? 'Unstar' : 'Star'} ${place.name}`} onClick={onStar}>
      {/* Remounts on change so starring replays the pop. */}
      <Star key={String(starred)} fill={starred ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  </li>;
}

export function SearchSheet(props: SearchSheetProps) {
  const { request, location, locationKnown, starred } = props;
  const { network, snapshot, status } = useTransit();
  const [phase, setPhase] = useState<Phase>('opening');
  const [closeStyle, setCloseStyle] = useState<'shrink' | 'fade'>('shrink');
  const [view, setView] = useState<'search' | 'trip'>(request.place ? 'trip' : 'search');
  const [tab, setTab] = useState<'places' | 'stops'>('places');
  const [enter, setEnter] = useState<Enter>('first');
  const [query, setQuery] = useState('');
  const [destination, setDestination] = useState<Destination | null>(request.place ?? null);
  const [trip, setTrip] = useState<PlannedTrip | null>(null);
  const [planning, setPlanning] = useState<'idle' | 'loading' | 'partial' | 'refreshing' | 'error'>('idle');
  const [recent, setRecent] = useState(() => getRecentSearches());
  const [now, setNow] = useState(() => new Date());
  const input = useRef<HTMLInputElement>(null);
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const latest = useRef({ location, network, snapshot }); latest.current = { location, network, snapshot };
  const planId = useRef(0);
  const selectedMode = useRef<TripMode | null>(null);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => { planId.current++; timers.current.forEach(clearTimeout); }, []);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);

  // Focus in the same task as the tap so phones raise the keyboard while the sheet grows.
  useLayoutEffect(() => { if (!request.place) input.current?.focus({ preventScroll: true }); }, []);
  // Start clipped to the origin box, then grow once that first frame has painted.
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => { setPhase('open'); props.onBehindChange(!reducedMotion()); }); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, []);

  const close = useCallback((style: 'shrink' | 'fade' = 'shrink', then?: () => void) => {
    if (phaseRef.current === 'closing') return;
    planId.current++;
    input.current?.blur();
    setCloseStyle(style);
    setPhase('closing');
    props.onBehindChange(false);
    then?.();
    later(props.onClosed, reducedMotion() ? 0 : style === 'fade' ? FADE_MS : CLOSE_MS);
  }, [props.onBehindChange, props.onClosed]);

  const plan = useCallback(async (dest: Destination, keepMode?: TripMode) => {
    const id = ++planId.current;
    selectedMode.current = keepMode ?? null;
    setPlanning(keepMode ? 'refreshing' : 'loading');
    try {
      const { location: origin, network: net, snapshot: snap } = latest.current;
      const options = await computeTripOptions({ origin, destination: dest, network: net, snapshot: snap,
        onWalkReady: walk => {
          if (id !== planId.current || keepMode) return;
          setTrip({ options: { walk, bus: null, busUnavailable: null, recommended: 'walk' }, mode: 'walk', destination: dest });
          setPlanning('partial');
        },
      });
      if (id !== planId.current) return;
      if (!options.walk && !options.bus) throw new Error('No walking or bus route');
      const chosen = selectedMode.current;
      setTrip({ options, mode: chosen && options[chosen] ? chosen : options.recommended, destination: dest });
      setPlanning('idle');
    } catch (e) {
      console.error(e);
      if (id === planId.current) setPlanning('error');
    }
  }, []);
  useEffect(() => { if (request.place) void plan(request.place); }, []);

  const pick = (place: Destination) => {
    addRecentSearch({ label: place.name, address: place.address, lat: place.lat, lon: place.lon });
    setDestination(place);
    setTrip(null);
    setView('trip');
    setEnter('push');
    void plan(place);
  };
  const back = () => {
    planId.current++;
    setRecent(getRecentSearches());
    setTrip(null);
    setPlanning('idle');
    setView('search');
    setEnter('pop');
  };
  const switchTab = (next: 'places' | 'stops') => {
    if (next === tab) return;
    setTab(next);
    setEnter(next === 'stops' ? 'right' : 'left');
  };

  const isStarred = (place: Destination) => starred.some(s => samePlace(s, place));
  const walkLabel = (place: Coordinate) => (locationKnown ? `${getWalkTimeMinutes(getDistanceMeters(location, place))} min walk` : null);

  // Places tab.
  const q = query.trim();
  const campusResults = useMemo(() => searchCampusPlaces(q), [q]);
  const geocode = useGeocode(q, location);
  const addressResults = geocode.results.filter(a => !campusResults.some(c => samePlace(c, a)));
  const recentPlaces: Destination[] = recent
    .filter(r => r.lat != null && r.lon != null)
    .map(r => ({ id: `recent-${r.label}`, name: r.label, address: r.address, lat: r.lat!, lon: r.lon! }))
    .filter(r => !isStarred(r))
    .slice(0, 4);
  const popular = CAMPUS_PLACES.filter(p => !isStarred(p) && !recentPlaces.some(r => samePlace(r, p))).slice(0, 6);
  let rowIndex = 0;
  const row = (place: Destination, icon: PlaceRowProps['icon']) => placeRow({ place, icon, query: q,
    walk: walkLabel(place), starred: isStarred(place), index: rowIndex++, onPick: () => pick(place), onStar: () => props.onToggleStar(place) });
  const section = (title: string, makeRows: () => React.ReactNode) => {
    const labelIndex = rowIndex++;
    const rows = makeRows();
    return <section className="ss-section" aria-label={title}>
      <h3 className="ss-label" style={{ '--i': Math.min(labelIndex, 10) } as React.CSSProperties}>{title}</h3><ul className="ss-list">{rows}</ul>
    </section>;
  };

  // Nearest stops tab: one entry per stop name, with each route's next two buses.
  const stops = useMemo(() => {
    if (!network || tab !== 'stops') return [];
    const seen = new Set<string>();
    return findKNearestStops(location, getActiveStops(network, snapshot), 12)
      .filter(({ stop }) => !seen.has(stop.name) && (seen.add(stop.name), true))
      .slice(0, 5)
      .map(({ stop, distanceMeters }) => {
        const byRoute = new Map<RouteId, { etaSec: number; scheduled: boolean }[]>();
        for (const a of nextArrivalsByRoute({ stopId: stop.id, network, snapshot, status, now, perRoute: 2 })) {
          byRoute.set(a.routeId, [...(byRoute.get(a.routeId) ?? []), { etaSec: a.etaSec, scheduled: a.source === 'scheduled' }]);
        }
        return { stop, walkMin: getWalkTimeMinutes(distanceMeters), routes: [...byRoute.entries()] };
      });
  }, [network, snapshot, status, location, now, tab]);
  const summary = homeServiceSummary(status, now);

  const o = request.origin;
  const clip = phase === 'open' || (phase === 'closing' && closeStyle === 'fade')
    ? 'inset(0px 0px 0px 0px round 0px)'
    : `inset(${Math.max(0, o.top)}px ${Math.max(0, window.innerWidth - o.right)}px ${Math.max(0, window.innerHeight - o.bottom)}px ${Math.max(0, o.left)}px round 12px)`;
  const stopNameById = useMemo(() => new Map((network?.stops ?? []).map(s => [s.id, s.name] as const)), [network]);
  const destinationStarred = destination ? isStarred(destination) : false;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (view === 'trip' && !request.place) back(); else close();
  };

  // Inside the rider app's style scope (trip results rely on it), though portaled out of its scaled root.
  return createPortal(<div className="passenger-app ss-root" data-phase={phase} data-close={closeStyle}>
    <div className="ss-dim" aria-hidden="true" onClick={() => close()} />
    <section className="ss-sheet" role="dialog" aria-modal="true" aria-label={view === 'trip' && destination ? `Trip to ${destination.name}` : 'Search places and stops'}
      style={{ clipPath: clip, WebkitClipPath: clip }} onKeyDown={onKeyDown}>

      {view === 'search' ? <header key="search" className="ss-header" data-enter={enter}>
        <div className="ss-search-row">
          <label className="ss-field">
            <Search aria-hidden="true" />
            <input ref={input} type="search" value={query} placeholder="Building, stop or address" aria-label="Search a building or stop"
              autoComplete="off" enterKeyHint="search"
              onChange={e => { setQuery(e.target.value); setTab('places'); if (enter === 'first') setEnter('none'); }} />
            {query && <button type="button" className="ss-clear" aria-label="Clear search" onClick={() => { setQuery(''); input.current?.focus(); }}><X aria-hidden="true" /></button>}
          </label>
          <button type="button" className="ss-cancel" onClick={() => close()}>Cancel</button>
        </div>
        <div className="ss-segment" role="group" aria-label="Show places or nearest stops" data-tab={tab}>
          <span className="ss-segment-pill" aria-hidden="true" />
          <button type="button" aria-pressed={tab === 'places'} onClick={() => switchTab('places')}><Star aria-hidden="true" />Places</button>
          <button type="button" aria-pressed={tab === 'stops'} onClick={() => switchTab('stops')}><Bus aria-hidden="true" />Nearest stops</button>
        </div>
      </header> : <header key="trip" className="ss-header ss-trip-header" data-enter={enter}>
        {!request.place && <button type="button" className="ss-icon-button" aria-label="Back to search" onClick={back}><ArrowLeft aria-hidden="true" /></button>}
        <div className="ss-endpoints">
          <p className="ss-endpoint"><Navigation aria-hidden="true" /><span className="ss-chip">Current location</span></p>
          <p className="ss-endpoint"><MapPin aria-hidden="true" /><strong>{destination?.name}</strong>
            {destination && <button type="button" className="ss-star" aria-pressed={destinationStarred} aria-label={`${destinationStarred ? 'Unstar' : 'Star'} ${destination.name}`}
              onClick={() => props.onToggleStar(destination)}><Star key={String(destinationStarred)} fill={destinationStarred ? 'currentColor' : 'none'} aria-hidden="true" /></button>}
          </p>
        </div>
        <button type="button" className="ss-icon-button ss-close" aria-label="Close" onClick={() => close()}><X aria-hidden="true" /></button>
      </header>}

      <div className="ss-body">
        {view === 'search' && tab === 'places' && <div key="places" className="ss-pane" data-enter={enter}>
          {q ? <>
            {campusResults.length > 0 && section('Campus places', () => campusResults.map(p => row(p, 'place')))}
            {addressResults.length > 0 && section('Addresses', () => addressResults.map(p => row(p, 'place')))}
            {geocode.loading && !campusResults.length && !addressResults.length && <p className="ss-note" role="status">Searching…</p>}
            {!geocode.loading && !campusResults.length && !addressResults.length && <p className="ss-note" role="status">No places match “{q}”.</p>}
          </> : <>
            {section('Starred', () => starred.length ? starred.map(p => row(p, 'star'))
              : <li className="ss-row ss-hint" style={{ '--i': rowIndex++ } as React.CSSProperties}>Tap the star on any place to pin it here and on Home.</li>)}
            {recentPlaces.length > 0 && section('Recent', () => recentPlaces.map(p => row(p, 'recent')))}
            {section('Popular on campus', () => popular.map(p => row(p, 'place')))}
          </>}
        </div>}

        {view === 'search' && tab === 'stops' && <div key="stops" className="ss-pane" data-enter={enter}>
          <div className="ss-stops-heading ss-row" style={{ '--i': 0 } as React.CSSProperties}>
            <h3 className="ss-label">{locationKnown ? 'Nearest stops' : 'Stops near the Student Union'}</h3>
            {status === 'live' ? <span className="ss-live"><i aria-hidden="true" />Live</span> : <span className="ss-service">{summary.label}</span>}
          </div>
          {!network ? <p className="ss-note" role="status">Loading stops…</p> : <ul className="ss-list">
            {stops.map(({ stop, walkMin, routes }, i) => <li key={stop.id} className="ss-row" style={{ '--i': i + 1 } as React.CSSProperties}>
              <button type="button" className="ss-stop" onPointerDown={preloadMap} onFocus={preloadMap} onClick={() => close('fade', () => props.onSelectStop(stop))}>
                <span className="ss-row-text"><strong>{stop.name}</strong>
                  {locationKnown && <span className="ss-walk"><Footprints aria-hidden="true" />{walkMin} min walk</span>}</span>
                <span className="ss-times">
                  {routes.length ? routes.map(([routeId, times]) => <span key={routeId} className="ss-time" data-route={routeId}>
                    <span className="ss-time-route"><i aria-hidden="true" />{shortRoute(routeId)}{times[0].scheduled && <em>est.</em>}</span>
                    <span className="ss-time-main">{times[0].etaSec < 60 ? <strong>Now</strong> : <><strong><RollingNumber value={Math.floor(times[0].etaSec / 60)} /></strong><small>min</small></>}</span>
                    {times[1] && <span className="ss-time-then">then {Math.floor(times[1].etaSec / 60)} min</span>}
                  </span>) : <span className="ss-time-none">{summary.tone === 'inactive' ? `From ${summary.value}` : 'No buses soon'}</span>}
                </span>
              </button>
            </li>)}
          </ul>}
          <p className="ss-note ss-row" style={{ '--i': stops.length + 1 } as React.CSSProperties}>
            {locationKnown ? 'Walking times are from your location.' : 'Turn on location to see the stops nearest you.'} Tap a stop to see it on the map.</p>
        </div>}

        {view === 'trip' && <div key={`trip-${destination?.id}`} className="ss-pane ss-trip" data-enter={enter}>
          {planning === 'loading' && <div className="trip-loading" role="status">
            <p className="trip-loading-title">Finding walk and bus options…</p>
            <div aria-hidden="true" className="skel" style={{ width: '60%', height: 30 }} />
            <div aria-hidden="true" className="trip-skel-options"><div className="skel" style={{ height: 96, borderRadius: 14 }} /><div className="skel" style={{ height: 96, borderRadius: 14 }} /></div>
            <div aria-hidden="true" className="skel" style={{ height: 190, borderRadius: 18 }} />
          </div>}
          {planning === 'error' && destination && <div className="ss-error" role="alert">
            <AlertCircle aria-hidden="true" /><p>We couldn’t plan this trip. Check your connection and try again.</p>
            <button type="button" onClick={() => void plan(destination)}>Try again</button>
          </div>}
          {trip && planning !== 'loading' && planning !== 'error' && <TripResults trip={trip} stopNameById={stopNameById} refreshing={planning === 'refreshing'} busPending={planning === 'partial'}
            onModeChange={mode => { selectedMode.current = mode; setTrip({ ...trip, mode }); }}
            onStart={() => { const journey = trip.options[trip.mode]; if (journey) close('fade', () => props.onStartTrip(journey)); }}
            onRefresh={() => void plan(trip.destination, trip.mode)} />}
        </div>}
      </div>

      <div className="ss-cover" aria-hidden="true">
        <span className="ss-cover-label" style={{ top: o.top, left: o.left, height: o.height }}>
          {request.place ? <MapPin aria-hidden="true" /> : <Search aria-hidden="true" />}{request.label}
        </span>
      </div>
    </section>
  </div>, document.body);
}

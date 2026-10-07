import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowUpRight, Bus, ChevronRight, Clock, LocateOff, Plus, Radio, RefreshCw, Search, Star } from 'lucide-react';
import type { Coordinate, Destination, LiveVehicle, Stop } from '../types';
import { useTransit } from '../context/TransitProvider';
import { getActiveStops, getStopById } from '../utils/transitSelectors';
import { getStopArrivals, nextArrivalsByRoute } from '../utils/arrivals';
import { eligibleCampusLocation } from '../utils/mapPresentation';
import { getDistanceMeters, getWalkTimeSeconds } from '../utils/geo';
import { homeBoardingStop, homeDeparture, homeEta, homeServiceSummary, homeUrgency, nearestHomeStop, serviceCountdown } from '../utils/homePresentation';
import { RollingNumber } from './RollingNumber';
import { PullToRefresh } from './PullToRefresh';
import { useStarredTrips, type StarredTrip } from '../hooks/useStarredTrips';
import { busTripTimes, journeySec } from '../utils/tripPlanning';
import './home.css';
import { preloadMap } from './MapRenderer';

interface HomeViewProps {
  location: Coordinate;
  locationResolved: boolean;
  loadingLocation: boolean;
  /** Starred places, shown with when to leave for each. */
  starred: Destination[];
  /** Opens the search sheet, growing out of `from`; with a place, straight to its trip options. */
  onOpenSearch: (from: HTMLElement, place?: Destination) => void;
  onSelectBus: (bus: LiveVehicle) => void;
  onSelectStop: (stop: Stop) => void;
  onBrowseMap: () => void;
}

/** "11:56" and "PM" apart, so the time can be large and the period small. */
function Eta({ seconds, stale = false }: { seconds: number | null; stale?: boolean }) {
  const eta = homeEta(seconds, stale);
  return <span className="home-eta"><span><RollingNumber value={eta.value} /></span>{eta.unit && <small>{eta.unit}</small>}</span>;
}

function clockParts(date: Date): { time: string; period: string } {
  const parts = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).formatToParts(date);
  return { time: parts.filter(p => p.type !== 'dayPeriod').map(p => p.value).join('').trim(), period: parts.find(p => p.type === 'dayPeriod')?.value ?? '' };
}

/** A starred place with the quickest way there right now: the bus to catch and when to leave, or the walk. */
function starredPlaceRow({ place, trip, now, onOpen }: { place: Destination; trip?: StarredTrip; now: Date; onOpen: (el: HTMLElement, place?: Destination) => void }) {
  let route: { id?: string; name?: string } | null = null;
  let walkMin: number | null = null;
  let note = '';
  let arrive: Date | null = null;
  if (trip?.state === 'ready') {
    const { bus, walk, recommended, busUnavailable } = trip.options;
    const times = bus ? busTripTimes(bus, now) : null;
    if (recommended === 'bus' && bus && times && !times.missed) {
      const leg = bus.segments.find(s => s.type === 'bus');
      route = { id: leg?.routeId, name: leg?.routeName };
      note = times.leaveInMin > 0 ? `Leave in ${times.leaveInMin} min` : 'Leave now';
      arrive = times.arriveAt;
    } else if (walk) {
      walkMin = Math.ceil(journeySec(walk) / 60);
      note = bus ? 'Faster than the bus' : busUnavailable === 'not-running' ? 'Buses aren’t running' : 'Best on foot';
      arrive = new Date(now.getTime() + journeySec(walk) * 1000);
    }
  }
  const at = arrive ? clockParts(arrive) : null;
  return <button key={place.id} type="button" className="home-place" aria-haspopup="dialog" onClick={e => onOpen(e.currentTarget, place)}>
    <span className="home-place-tile"><Star fill="currentColor" aria-hidden="true" /></span>
    <span className="home-place-copy">
      <strong>{place.name}</strong>
      {note ? <span className="home-place-meta">
        {route ? <span className="home-place-pill" data-route={route.id}>{route.name}</span> : <span className="home-place-pill walk">Walk {walkMin} min</span>}
        {note}
      </span> : trip?.state === 'loading' ? <span className="skel home-place-skel" role="status"><span className="sr-only">Finding the quickest way</span></span>
        : place.address ? <span className="home-place-sub">{place.address.replace(/, Chapel Hill, NC.*$/, '')}</span> : null}
    </span>
    {at && <span className="home-place-arrive"><small>Arrive</small><strong>{at.time}<small>{at.period}</small></strong></span>}
    <ChevronRight className="home-chevron" size={16} aria-hidden="true" />
  </button>;
}

/** Placeholder shaped like the next-ride card while location and arrivals load. */
function NextRideSkeleton({ label }: { label: string }) {
  return <div className="home-skeleton" role="status">
    <span className="sr-only">{label}</span>
    <div className="skel home-skel-title" />
    <div className="home-skel-card" aria-hidden="true">
      <div className="skel" style={{ width: '38%', height: 28 }} />
      <div className="skel" style={{ width: '58%', height: 52 }} />
      <div className="skel" style={{ width: '80%', height: 22 }} />
      <div className="skel" style={{ height: 48 }} />
    </div>
  </div>;
}

/** [left %, top %, twinkle delay s] for the before-service night sky. */
const STARS: [number, number, number][] = [[8, 14, 0], [22, 30, .7], [35, 10, 1.4], [48, 24, .3], [58, 8, 1.9], [66, 34, 1.1], [14, 46, 1.6], [42, 40, .9], [28, 58, 2.2], [52, 52, .5]];

function EmptyCard({ icon: Icon, title, tone = '', action, children }: { icon: React.ElementType; title: string; tone?: string; action?: { label: string; onClick: () => void; disabled?: boolean }; children: React.ReactNode }) {
  return <section className={`home-empty-card ${tone}`} aria-label={title}>
    <Icon className="home-state-icon" aria-hidden="true" />
    <h2>{title}</h2>
    {children}
    {action && <button className="home-secondary-action" onClick={action.onClick} disabled={action.disabled}>{action.label}<ChevronRight size={20} aria-hidden="true" /></button>}
  </section>;
}

export function HomeView(props: HomeViewProps) {
  const { network, networkStatus, snapshot, status, vehicles, refresh, refreshing } = useTransit();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(timer); }, []);
  const summary = homeServiceSummary(status, now);
  const StatusIcon = summary.tone === 'warning' ? AlertCircle : summary.tone === 'inactive' ? Clock : Radio;
  const stops = useMemo(() => getActiveStops(network, snapshot), [network, snapshot]);
  const nearestStop = useMemo(() => nearestHomeStop(props.location, props.locationResolved, stops), [props.location, props.locationResolved, stops]);
  // Once live data is in, board at the closest stop a bus is actually coming to, not just the closest stop.
  const boarding = useMemo(() => status === 'loading' ? null : homeBoardingStop(props.location, props.locationResolved, stops,
    stopId => getStopArrivals({ stopId, network, snapshot, status, now, limit: Infinity })),
    [props.location, props.locationResolved, stops, network, snapshot, status, now]);
  const nearest = boarding?.stop ?? nearestStop;
  const walkSec = boarding?.walkSec ?? (nearest ? getWalkTimeSeconds(getDistanceMeters(props.location, nearest)) : 0);
  const departure = boarding ? homeDeparture(boarding.arrivals, boarding.walkSec) : null;
  const trackingFailed = status === 'unavailable';
  const refreshAction = { label: refreshing ? 'Refreshing…' : 'Try again', onClick: () => void refresh(), disabled: refreshing };
  const shownPlaces = props.starred.slice(0, 4);
  const starredTrips = useStarredTrips(shownPlaces, eligibleCampusLocation(props.location, props.locationResolved));
  const listMessage = status === 'loading' ? 'Loading buses…'
    : trackingFailed ? 'Live bus information is unavailable. Try refreshing.'
      : summary.tone === 'inactive' ? `Service begins at ${summary.value}.`
        : 'No buses are reporting right now.';

  let nearby: React.ReactNode;
  if (!network && networkStatus === 'unavailable') {
    nearby = <EmptyCard icon={AlertCircle} title="Route information unavailable" tone="warning" action={{ ...refreshAction, label: refreshing ? 'Refreshing…' : 'Retry' }}><p>Routes and stops could not be loaded. We’ll retry automatically.</p></EmptyCard>;
  } else if (summary.tone === 'inactive') {
    // Nothing to catch before service — show the countdown even while location is still resolving.
    nearby = <section className="home-night" aria-labelledby="home-night-title">
      <span className="home-stars" aria-hidden="true">{STARS.map(([left, top, delay], i) => <i key={i} style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s` }} />)}</span>
      <span className="home-moon" aria-hidden="true" />
      <h2 id="home-night-title" className="home-night-count"><RollingNumber value={serviceCountdown(now)} /></h2>
      <p className="home-night-time">Buses start at {summary.value}</p>
      <button className="home-night-action" onPointerDown={preloadMap} onFocus={preloadMap} onClick={() => nearest ? props.onSelectStop(nearest) : props.onBrowseMap()}>{nearest ? 'View nearest stop' : 'Browse stops'}<ChevronRight size={20} aria-hidden="true" /></button>
    </section>;
  } else if (props.loadingLocation || (!network && networkStatus === 'loading') || (nearest && status === 'loading')) {
    nearby = <NextRideSkeleton label={props.loadingLocation ? 'Finding your nearest stop…' : nearest ? 'Loading arrivals…' : 'Loading campus stops…'} />;
  } else if (!nearest) {
    nearby = !props.locationResolved
      ? <EmptyCard icon={LocateOff} title="Find your boarding stop" action={{ label: 'Browse stops', onClick: props.onBrowseMap }}><p>Your location is unavailable. Browse campus stops to choose where to board.</p></EmptyCard>
      : eligibleCampusLocation(props.location, props.locationResolved)
        ? <EmptyCard icon={AlertCircle} title="Stops unavailable" tone="warning" action={refreshAction}><p>Stop information is unavailable right now.</p></EmptyCard>
        : <EmptyCard icon={LocateOff} title="Find your boarding stop" action={{ label: 'Browse stops', onClick: props.onBrowseMap }}><p>You’re outside the campus service area. Browse campus stops to choose where to board.</p></EmptyCard>;
  } else if (departure) {
    const { arrival, busInMin, walkMin, leaveInMin } = departure;
    const source = arrival.source === 'scheduled' ? 'Scheduled' : status === 'degraded' ? 'Delayed' : null;
    const urgency = homeUrgency(leaveInMin);
    // For riders who can't leave yet: the bus after this one, on either route.
    const after = nextArrivalsByRoute({ stopId: nearest.id, network, snapshot, status, now })
      .sort((a, b) => a.etaSec - b.etaSec).find(a => a.etaSec > arrival.etaSec + 60);
    nearby = <>
      <h2 className="home-title" id="home-next-title">Your next ride</h2>
      <section className="home-catch" data-route={arrival.routeId} data-urgency={urgency} aria-labelledby="home-next-title">
        <div className="home-catch-route"><span className="home-route-pill">{arrival.routeName}</span>
          {urgency !== 'calm' && <span className={`home-urgency ${urgency}`}>{urgency === 'now' ? 'Time to go' : 'Leave soon'}</span>}</div>
        <div className="home-catch-time">
          {leaveInMin > 0
            ? <p className="home-go"><span className="home-go-label">Go in</span><strong><RollingNumber value={leaveInMin} /></strong><span className="home-go-unit">min</span></p>
            : <p className="home-go now"><strong>Go now</strong></p>}
          {source && <span className="home-source">{arrival.source === 'scheduled' ? <Clock aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}{source}</span>}
          {/* Beside "Go in": the bus after this one, named only when it's on the other route. */}
          {after && <p className="home-after"><span>Next bus{after.routeId !== arrival.routeId && ` · ${after.routeName}`}{after.source === 'scheduled' && <small> · scheduled</small>}</span>
            <strong>{Math.floor(after.etaSec / 60)} min</strong></p>}
        </div>
        <div className="home-boarding"><span>Board at</span><h3>{nearest.name}</h3></div>
        <p className="home-bus-line"><Bus aria-hidden="true" /><span className="home-bus-text"><span><span>{busInMin < 1 ? 'Bus arriving now' : `Bus arrives in ${busInMin} min`}</span> <small>{walkMin} min walk</small></span></span></p>
        <button className="home-primary" onPointerDown={preloadMap} onFocus={preloadMap} onClick={() => props.onSelectStop(nearest)}>View stop on map <ArrowUpRight size={18} aria-hidden="true" /></button>
      </section>
    </>;
  } else if (trackingFailed) {
    nearby = <EmptyCard icon={AlertCircle} title="Arrival times unavailable" tone="warning" action={refreshAction}>
      <p>Buses may still be running. Live tracking is not updating.</p>
      <p className="home-source">Check again before heading to your stop.</p>
    </EmptyCard>;
  } else {
    nearby = <EmptyCard icon={Clock} title="No upcoming arrivals" action={{ label: 'View stop', onClick: () => props.onSelectStop(nearest) }}>
      <p>No buses are predicted at {nearest.name} right now.</p>
    </EmptyCard>;
  }

  return <PullToRefresh onRefresh={refresh}><div className="home-content">
    <p className={`home-status-line ${summary.tone}`} role="status"><StatusIcon aria-hidden="true" /><span>{summary.label}</span>{status === 'live' && <span className="home-live-dot" aria-hidden="true" />}</p>
    {nearby}

    <section className="home-where" aria-labelledby="home-where-title">
      <h2 id="home-where-title">Where to?</h2>
      <button type="button" className="home-search" aria-haspopup="dialog" onClick={e => props.onOpenSearch(e.currentTarget)}>
        <Search aria-hidden="true" />Search a building or stop
      </button>
      {shownPlaces.length > 0 ? <div className="home-places">
        {shownPlaces.map(place => starredPlaceRow({ place, trip: starredTrips[place.id], now, onOpen: el => props.onOpenSearch(el, place) }))}
      </div> : <p className="home-places-empty">Star places in search to see when to leave for them here.</p>}
      <button type="button" className="home-save-place" aria-haspopup="dialog" onClick={e => props.onOpenSearch(e.currentTarget)}>
        <Plus aria-hidden="true" />{shownPlaces.length ? 'Save another place' : 'Save a place'}
      </button>
    </section>
    <section className="home-campus" aria-labelledby="home-campus-title">
      <div className="home-list-heading"><h2 id="home-campus-title">Buses on campus</h2><button type="button" className="home-refresh" onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh bus times"><RefreshCw size={20} className={refreshing ? 'home-spinning' : ''} aria-hidden="true" /></button></div>
      <p className="home-list-explainer">Times below are to each bus’s next stop.</p>
      <div className="home-bus-rows">
        {status === 'loading' ? <div className="home-list-skeleton" role="status"><span className="sr-only">{listMessage}</span>
          {[0, 1].map(i => <div key={i} className="home-skel-row" aria-hidden="true"><span><i className="skel" style={{ width: '45%' }} /><i className="skel" style={{ width: '70%' }} /></span><i className="skel home-skel-eta" /></div>)}
        </div> : (!vehicles.length || trackingFailed) ? <p className="home-list-empty" role="status">{listMessage}</p> : vehicles.map(bus => {
          const stop = bus.nextStopId ? getStopById(network, bus.nextStopId) : null;
          const duplicates = vehicles.filter(v => v.routeId === bus.routeId).length > 1;
          const detail = [duplicates && bus.name, bus.stale ? 'Location not updating' : homeEta(bus.nextStopEtaSec).value === '—' ? 'Arrival time unavailable' : status === 'degraded' && 'Delayed'].filter(Boolean).join(' · ');
          return <button key={bus.id} type="button" className="home-bus-row" data-route={bus.routeId} onClick={() => props.onSelectBus(bus)}>
            <span className="home-bus-copy"><strong>{bus.routeName}</strong><span>{stop ? `Next: ${stop.name}` : 'Next stop unknown'}</span>{detail && <span className="home-source">{detail}</span>}</span>
            <Eta seconds={bus.nextStopEtaSec} stale={bus.stale} />
            <ChevronRight className="home-chevron" size={16} aria-hidden="true" />
          </button>;
        })}
      </div>
    </section>
  </div></PullToRefresh>;
}

/** Trip results in the search sheet: walk vs bus side by side, with the chosen option's logistics. */
import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, Bus, Clock, Footprints, RefreshCw } from 'lucide-react';
import type { Journey, JourneySegment } from '../types';
import { busTripTimes, busUnavailableMessage, journeySec, mainWalkingSteps, walkingMeters, type PlannedTrip, type TripMode } from '../utils/tripPlanning';
import { formatDistanceImperial } from '../utils/format';
import { RollingNumber } from './RollingNumber';
import { useTransit } from '../context/TransitProvider';
import { nextArrivalsByRoute } from '../utils/arrivals';
import './trip.css';
import { preloadMap } from './MapRenderer';

interface TripResultsProps {
  trip: PlannedTrip;
  stopNameById: Map<string, string>;
  refreshing: boolean;
  busPending?: boolean;
  onModeChange: (mode: TripMode) => void;
  onStart: () => void;
  onRefresh: () => void;
}

const clock = (date: Date) => date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
/** Walks and rides round up: better early than late. */
const mins = (sec: number) => Math.max(1, Math.ceil(sec / 60));
const busLeg = (journey: Journey) => journey.segments.find(s => s.type === 'bus') ?? null;
const walkLegs = (journey: Journey) => journey.segments.filter(s => s.type === 'walk');
const stopsWord = (n: number) => `${n} stop${n === 1 ? '' : 's'}`;
/** Just the main directions for a walking leg (see mainWalkingSteps). */
const usefulSteps = (segment?: JourneySegment) => mainWalkingSteps(segment?.steps);

/** Timeline row props: which leg follows this step (drawn on the rail) and its place in the draw-in. */
const step = (i: number, leg: 'walk' | 'bus' | 'end') => ({ 'data-leg': leg, style: { '--i': Math.min(i, 8) } as React.CSSProperties });
const RAIL = <span className="trip-rail" aria-hidden="true" />;

function Directions({ segment }: { segment?: JourneySegment }) {
  const steps = usefulSteps(segment);
  if (!steps.length) return null;
  return <details className="trip-more"><summary>Walking directions</summary>
    <ol>{steps.map((step, i) => <li key={i}>{step.instruction} <span>{formatDistanceImperial(step.distanceMeters)}</span></li>)}</ol>
  </details>;
}

export function TripResults({ trip, stopNameById, refreshing, busPending = false, onModeChange, onStart, onRefresh }: TripResultsProps) {
  const { options, mode, destination } = trip;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(timer); }, []);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  const { network, snapshot, status } = useTransit();
  const { walk, bus } = options;
  const times = bus ? busTripTimes(bus, now) : null;
  const ride = bus ? busLeg(bus) : null;
  // The bus after the planned one at the same stop, for riders who can't make it in time.
  const boardStopId = ride?.busOrderedStopIds?.[0];
  const nextBus = ride?.routeId && times && boardStopId ? nextArrivalsByRoute({ stopId: boardStopId, network, snapshot, status, now, perRoute: 3 })
    .filter(a => a.routeId === ride.routeId)
    .map(a => ({ at: new Date(now.getTime() + a.etaSec * 1000), estimated: a.source === 'scheduled' }))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .find(a => a.at.getTime() > times.boardAt.getTime() + 60000) ?? null : null;
  // Walking can start any time; the bus trip is pinned to the bus it was planned around.
  const walkArrive = walk ? new Date(now.getTime() + journeySec(walk) * 1000) : null;
  const fastest: TripMode | null = !busPending && walk && bus && Math.abs(journeySec(walk) - journeySec(bus)) >= 60
    ? (journeySec(walk) < journeySec(bus) ? 'walk' : 'bus') : null;
  const selected = mode === 'bus' ? bus : walk;
  // The option bars race at one speed, so the faster trip finishes first and wins the badge.
  const slowest = Math.max(walk ? journeySec(walk) : 0, bus ? journeySec(bus) : 0);
  const raceSec = (journey: Journey) => journeySec(journey) / slowest * 0.22;
  const race = (journey: Journey) => ({ '--race-w': `${journeySec(journey) / slowest * 100}%`, '--race-t': `${raceSec(journey)}s` } as React.CSSProperties);

  // Start and refresh sit right under the summary so riders don't scroll past the steps to find them.
  const actions = <div className="trip-actions">
    {selected && <button type="button" className="trip-start" data-route={mode === 'bus' ? ride?.routeId : undefined} onPointerDown={preloadMap} onFocus={preloadMap} onClick={onStart}>
      {mode === 'bus' ? 'Start trip on map' : 'Start walking on map'}<ArrowUpRight size={20} aria-hidden="true" />
    </button>}
    <button type="button" className="trip-refresh" onClick={onRefresh} disabled={refreshing || busPending}>
      <RefreshCw size={16} className={refreshing ? 'trip-spinning' : ''} aria-hidden="true" />{refreshing ? 'Refreshing…' : 'Refresh'}
    </button>
  </div>;

  const optionCard = (m: TripMode, journey: Journey | null) => {
    const Icon = m === 'bus' ? Bus : Footprints;
    return <button type="button" className="trip-option" data-mode={m} data-route={m === 'bus' ? ride?.routeId : undefined}
      aria-pressed={mode === m} disabled={!journey} onClick={() => onModeChange(m)}>
      <span className="trip-option-label"><Icon aria-hidden="true" />{m === 'bus' ? 'Bus' : 'Walk'}{fastest === m && journey && <span className="trip-badge" style={{ animationDelay: `${raceSec(journey)}s` }}>Fastest</span>}</span>
      {journey ? <>
        <span className="trip-option-time"><strong>{Math.ceil(journeySec(journey) / 60)}</strong> min</span>
        <span className="trip-option-note">Arrive {clock(m === 'bus' ? times!.arriveAt : walkArrive!)}</span>
        {m === 'bus' && ride && <span className="trip-option-route">{ride.routeName}</span>}
        <span className="trip-race" style={race(journey)} aria-hidden="true"><i /></span>
      </> : <span className="trip-option-note">{m === 'bus' && busPending ? 'Checking options…' : 'Unavailable'}</span>}
    </button>;
  };

  return <div className="trip-view trip-results" data-bus-pending={busPending}>
    <h2 ref={heading} tabIndex={-1} className="trip-dest">{destination.name}</h2>
    {destination.address && destination.address !== destination.name && <p className="trip-sub">{destination.address}</p>}
    <p className="trip-sub">From your location</p>

    <div className="trip-options" role="group" aria-label="Ways to get there">{optionCard('walk', walk)}{optionCard('bus', bus)}</div>
    {busPending ? <p className="trip-compare" role="status">Walking directions are ready. Checking bus options…</p>
      : !bus && <p className="trip-compare">{busUnavailableMessage(options.busUnavailable)}</p>}

    {mode === 'bus' && bus && ride && times ? <>
      <section className="trip-hero" data-route={ride.routeId} aria-label={`Bus trip on ${ride.routeName}`}>
        <span className="trip-route-pill">{ride.routeName}</span>
        {times.missed
          ? <p className="trip-missed"><AlertCircle aria-hidden="true" />This bus may have already left. Refresh times for the next one.</p>
          : <div className="trip-go">
              {times.leaveInMin > 0 ? <p><span>Go in</span><strong><RollingNumber value={times.leaveInMin} /></strong><span>min</span></p> : <p><strong>Go now</strong></p>}
              {ride.waitSource === 'scheduled' && <span className="trip-tag"><Clock aria-hidden="true" />Scheduled</span>}
            </div>}
        <span className="trip-label">Board at</span>
        <h3>{ride.fromName}</h3>
        <p className="trip-hero-note">Bus arrives {clock(times.boardAt)} · {mins(times.walkToStopSec)} min walk to stop</p>
        {nextBus && <p className="trip-after"><Clock aria-hidden="true" /><span>Miss it? Next bus {clock(nextBus.at)} · arrive {clock(new Date(nextBus.at.getTime() + (times.rideSec + times.finalWalkSec) * 1000))}{nextBus.estimated ? ' · est.' : ''}</span></p>}
      </section>
      {actions}
      <ol className="trip-steps" key="bus" data-route={ride.routeId}>
        <li {...step(0, 'walk')}><time>{clock(times.leaveAt)}</time>{RAIL}<div><strong>Leave</strong>
          <span>Walk {mins(times.walkToStopSec)} min ({formatDistanceImperial(walkLegs(bus)[0]?.distanceMeters ?? 0)}) to {ride.fromName}</span>
          <Directions segment={walkLegs(bus)[0]} /></div></li>
        <li {...step(1, 'bus')}><time>{clock(times.boardAt)}</time>{RAIL}<div><strong>Board {ride.routeName}</strong>
          <span>{times.waitAtStopSec >= 30 ? `Wait about ${mins(times.waitAtStopSec)} min at the stop` : 'The bus arrives as you do'}</span></div></li>
        <li {...step(2, 'walk')}><time>{clock(times.alightAt)}</time>{RAIL}<div><strong>Get off at {ride.toName}</strong>
          <span>{stopsWord(Math.max(1, (ride.stopsCount ?? 2) - 1))} · {mins(times.rideSec)} min ride</span>
          {(ride.busOrderedStopIds?.length ?? 0) > 2 && <details className="trip-more"><summary>Stops on the way</summary>
            <ol>{ride.busOrderedStopIds!.slice(1, -1).map(id => <li key={id}>{stopNameById.get(id) ?? id}</li>)}</ol></details>}</div></li>
        <li {...step(3, 'end')}><time>{clock(times.arriveAt)}</time>{RAIL}<div><strong>Arrive at {destination.name}</strong>
          <span>Walk {mins(times.finalWalkSec)} min ({formatDistanceImperial(walkLegs(bus)[1]?.distanceMeters ?? 0)})</span>
          <Directions segment={walkLegs(bus)[1]} /></div></li>
      </ol>
    </> : walk && walkArrive ? <>
      <section className="trip-hero" data-mode="walk" aria-label="Walking trip">
        <div className="trip-go"><p><strong>{mins(journeySec(walk))}</strong><span>min walk</span></p></div>
        <p className="trip-hero-note">{formatDistanceImperial(walkingMeters(walk))} · Arrive {clock(walkArrive)}</p>
      </section>
      {actions}
      <ol className="trip-steps" key="walk">
        {usefulSteps(walk.segments[0]).map((s, i) =>
          <li key={i} {...step(i, 'walk')}><time>{formatDistanceImperial(s.distanceMeters)}</time>{RAIL}<div><strong>{s.instruction}</strong></div></li>)}
        <li {...step(usefulSteps(walk.segments[0]).length, 'end')}><time>{clock(walkArrive)}</time>{RAIL}<div><strong>Arrive at {destination.name}</strong></div></li>
      </ol>
    </> : null}

  </div>;
}

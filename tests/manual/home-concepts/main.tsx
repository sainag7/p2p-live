import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, Bus, Check, ChevronRight, Clock, Footprints, Home, Map, MapPin, Radio, Route, SlidersHorizontal, X, AlertCircle, LocateOff } from 'lucide-react';
import './styles.css';

type Mode = 'running' | 'before' | 'unavailable' | 'location';
type Concept = 'A' | 'B' | 'C';
type RouteKey = 'ex' | 'bh';
type Detail = { type: 'stop' } | { type: 'bus'; route: RouteKey } | { type: 'login' } | null;
const routeNames = { ex: 'P2P Express', bh: 'Baity Hill' };
const buses = [
  { id: 'ex' as const, minutes: 2, name: 'Express 01', stop: 'Granville Towers East' },
  { id: 'bh' as const, minutes: 7, name: 'Baity 02', stop: 'Hinton James / Horton Residence Hall' },
];
const concepts: { id: Concept; title: string; description: string; takeaway: string }[] = [
  { id: 'A', title: 'Familiar, improved', description: 'The earlier bus cards, with a much clearer nearby stop.', takeaway: 'A familiar layout. Route icons make the bus list easy to scan.' },
  { id: 'B', title: 'Catch your bus', description: 'One clear answer first: where to board and when it arrives.', takeaway: 'Recommended. The next arrival, stop, and walk are unmistakable.' },
  { id: 'C', title: 'Campus departures', description: 'A stop-first departure board, with less card clutter.', takeaway: 'Best for comparing the next departures at the same stop.' },
];
const stopName = 'Fetzer Gym (SRC / Student Union)';

function Time({ minutes, large = false }: { minutes: number; large?: boolean }) {
  return <span className={`arrival-number ${large ? 'large' : ''}`}><strong>{minutes}</strong><span>min</span></span>;
}

function Status({ mode }: { mode: Mode }) {
  return <div className={`service-line ${mode === 'unavailable' ? 'warning' : ''}`} role="status">
    {mode === 'unavailable' ? <AlertCircle /> : mode === 'before' ? <Clock /> : <Radio />}
    <span>{mode === 'unavailable' ? 'Live tracking unavailable' : mode === 'before' ? 'Service starts at 7:00 PM' : 'Service running'}</span>
    {(mode === 'running' || mode === 'location') && <span className="live-dot" aria-hidden="true" />}
  </div>;
}

function Filters({ enabled, toggle }: { enabled: RouteKey[]; toggle: (route: RouteKey) => void }) {
  return <div className="route-filters" role="group" aria-label="Filter buses on campus">
    {(['ex', 'bh'] as const).map(id => <button key={id} className={`filter ${id}`} aria-pressed={enabled.includes(id)} onClick={() => toggle(id)}>
      <span className="filter-check" aria-hidden="true">{enabled.includes(id) && <Check />}</span>{routeNames[id]}
    </button>)}
  </div>;
}

function DetailPanel({ detail, close }: { detail: NonNullable<Detail>; close: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    closeButton.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const bus = detail.type === 'bus' ? buses.find(b => b.id === detail.route)! : null;
  return <section className="detail-panel" role="dialog" aria-label={bus ? `${routeNames[bus.id]} details` : detail.type === 'login' ? 'Login preview' : 'Stop preview'} onKeyDown={event => { if (event.key === 'Escape') close(); }}>
    <div className="detail-top"><span className="demo-label">Demo preview</span><button ref={closeButton} className="icon-button" aria-label="Close details" onClick={close}><X /></button></div>
    <h2>{bus ? routeNames[bus.id] : detail.type === 'login' ? 'P2P account' : stopName}</h2>
    {bus ? <><p className="muted">{bus.name} · Example vehicle</p><div className="detail-arrival"><Time minutes={bus.minutes} /><p>Next stop<br /><strong>{bus.stop}</strong></p></div><p className="source"><Radio /> Live prediction · Demo</p></>
      : detail.type === 'login' ? <p>This concept preserves login access. Account screens are unchanged; no sign-in is performed in this preview.</p>
      : <><p className="walk"><Footprints /> Approx. 3 min walk</p><div className="stop-departure ex"><span>P2P Express</span><strong>8 min</strong></div><div className="stop-departure bh"><span>Baity Hill</span><strong>12 min</strong></div><p className="source">Example live arrivals. Walking time is approximate.</p></>}
  </section>;
}

function EmptyNearby({ mode, browse }: { mode: Mode; browse: () => void }) {
  return <div className={`nearby-empty ${mode}`}>
    {mode === 'before' ? <><Clock className="state-icon" /><h2>Your evening ride</h2><div className="service-time">7:00 <span>PM</span></div><p>Buses begin service tonight.</p><p className="source">Scheduled start · No live arrivals yet</p></>
      : mode === 'unavailable' ? <><AlertCircle className="state-icon" /><h2>Arrival times unavailable</h2><p>Buses may still be running. Live tracking is not updating.</p><p className="source">Check again before heading to your stop.</p></>
      : <><LocateOff className="state-icon" /><h2>Find your boarding stop</h2><p>Your location is unavailable. Browse campus stops to choose where to board.</p></>}
    <button className="secondary-action" onClick={browse}>Browse stops <ChevronRight /></button>
  </div>;
}

function Nearby({ concept, mode, onSelect }: { concept: Concept; mode: Mode; onSelect: () => void }) {
  if (mode !== 'running') return <EmptyNearby mode={mode} browse={onSelect} />;
  if (concept === 'C') return <section className="departure-board" aria-label="At your nearby stop">
    <div className="board-stop"><div className="section-kicker"><MapPin /> Your nearby stop</div><h2>{stopName}</h2><p className="walk"><Footprints /> Approx. 3 min walk</p></div>
    <h3>At this stop</h3>
    {(['ex', 'bh'] as const).map((id, index) => <button className={`departure-row ${id}`} key={id} onClick={onSelect}>
      <span className="departure-name"><span className="route-code">{id.toUpperCase()}</span><strong>{routeNames[id]}</strong><span className="source">Live prediction</span></span>
      <Time minutes={index ? 12 : 8} /><ChevronRight />
    </button>)}
    <button className="board-link" onClick={onSelect}>View boarding stop <ArrowUpRight /></button>
  </section>;
  if (concept === 'B') return <section className="catch-card" aria-label="Next bus at your nearby stop">
    <div className="hero-route"><span className="route-code">EX</span><strong>P2P Express</strong></div>
    <div className="hero-time"><Time minutes={8} large /><span className="source"><Radio /> Live prediction</span></div>
    <div className="boarding"><span>Board at</span><h2>{stopName}</h2></div>
    <p className="walk"><Footprints /> Approx. 3 min walk</p>
    <button className="primary-action" onClick={onSelect}>View stop <ArrowUpRight /></button>
  </section>;
  return <section className="familiar-nearby" aria-label="Next bus at your nearby stop">
    <div className="section-kicker"><MapPin /> Your nearby stop</div><h2>{stopName}</h2>
    <p className="walk"><Footprints /> Approx. 3 min walk</p>
    <button className="nearest-arrival" onClick={onSelect}><span><span className="route-code ex">EX</span><strong>P2P Express</strong><span className="source">Live prediction</span></span><Time minutes={8} /><ChevronRight /></button>
    <button className="board-link" onClick={onSelect}>View boarding stop <ArrowUpRight /></button>
  </section>;
}

function Phone({ concept, mode, textScale }: { concept: Concept; mode: Mode; textScale: number }) {
  const [enabled, setEnabled] = useState<RouteKey[]>(['ex', 'bh']);
  const [detail, setDetail] = useState<Detail>(null);
  const [browsing, setBrowsing] = useState(false);
  useEffect(() => { setDetail(null); setBrowsing(false); }, [mode]);
  const toggle = (id: RouteKey) => setEnabled(current => current.includes(id) ? current.filter(r => r !== id) : [...current, id]);
  return <div className={`phone concept-${concept}`} style={{ '--text-scale': textScale } as React.CSSProperties} aria-label={`Concept ${concept} preview`}>
    <header className="phone-header"><div className="wordmark"><em><span>P</span><b>2</b><span>P</span></em> Live</div><button className="login" onClick={() => setDetail({ type: 'login' })}>P2P Login</button></header>
    <main className="phone-scroll" tabIndex={0} aria-label={`Concept ${concept} scrollable Home`}>
      <div className="demo-strip">Design preview · Demo data</div>
      <Status mode={mode} />
      {concept === 'B' && mode === 'running' && <h1 className="catch-title">Your next ride.</h1>}
      <Nearby concept={concept} mode={mode} onSelect={() => mode === 'running' ? setDetail({ type: 'stop' }) : setBrowsing(true)} />
      {browsing && <section className="browse-preview"><h2>Campus stops</h2><p>Example stop list. Open Map in the live app for directions.</p>{[stopName, 'Granville Towers East', 'Hinton James / Horton Residence Hall'].map(name => <p className="browse-stop" key={name}><MapPin />{name}</p>)}<button className="secondary-action" onClick={() => setBrowsing(false)}>Close stop list</button></section>}
      <section className="campus-buses"><div className="list-heading"><h2>{concept === 'A' ? 'Active buses' : 'Buses on campus'}</h2><Bus aria-hidden="true" /></div><p className="list-explainer">Times below are to each bus’s next stop.</p>
        <Filters enabled={enabled} toggle={toggle} />
        <div className="bus-rows" aria-live="polite">
          {!enabled.length ? <p className="list-empty">Select a route to see its buses.</p> : mode === 'before' ? <p className="list-empty">Service begins at <strong>7:00 PM.</strong></p> : mode === 'unavailable' ? <p className="list-empty">Live bus information is unavailable.</p> : buses.filter(bus => enabled.includes(bus.id)).map(bus => <button className={`bus-row ${bus.id}`} key={bus.id} onClick={() => setDetail({ type: 'bus', route: bus.id })}>
            {concept === 'A' && <span className="bus-icon"><Bus /></span>}
            <span className="bus-copy"><strong>{routeNames[bus.id]}</strong><span>Next: {bus.stop}</span><span className="source">Live prediction</span></span><Time minutes={bus.minutes} /><ChevronRight className="bus-chevron" />
          </button>)}
        </div>
      </section>
      <p className="prototype-note">Illustrative arrivals and walking estimates.</p>
    </main>
    <nav className="phone-nav" aria-label="Navigation preview — visual only"><span aria-current="page"><Home />Home</span><span><Route />Plan Trip</span><span><Map />Map</span></nav>
    {detail && <DetailPanel detail={detail} close={() => setDetail(null)} />}
  </div>;
}

function App() {
  const params = new URLSearchParams(window.location.search);
  const initialMode = params.get('state') as Mode;
  const [mode, setMode] = useState<Mode>(['running', 'before', 'unavailable', 'location'].includes(initialMode) ? initialMode : 'running');
  const [width, setWidth] = useState(390);
  const [textScale, setTextScale] = useState(1);
  const single = concepts.find(c => c.id === params.get('concept'));
  if (single) return <div className="single-preview"><Phone concept={single.id} mode={mode} textScale={textScale} /></div>;
  return <div className="comparison">
    <header className="comparison-header"><span className="design-label">P2P Live / Home exploration</span><h1>A clearer way to catch your ride.</h1><p>Three directions. The same arrivals. Bigger information where it matters.</p></header>
    <section className="comparison-controls" aria-label="Shared preview controls"><label>Service state<select value={mode} onChange={e => setMode(e.target.value as Mode)}><option value="running">Service running</option><option value="before">Before service</option><option value="unavailable">Tracking unavailable</option><option value="location">Location unavailable</option></select></label><label>Phone width<select value={width} onChange={e => setWidth(Number(e.target.value))}><option value={390}>390 px</option><option value={360}>360 px</option></select></label><label>Text size<select value={textScale} onChange={e => setTextScale(Number(e.target.value))}><option value={1}>100%</option><option value={2}>200%</option></select></label><p><SlidersHorizontal /> Try the filters and arrival cards inside each preview.</p></section>
    <div className="concept-grid" style={{ '--phone-width': `${width}px` } as React.CSSProperties}>{concepts.map(c => <article className="concept-column" key={c.id}>
      <div className="concept-heading"><span>{c.id}</span><div><h2>{c.title}</h2><p>{c.description}</p></div></div>
      <Phone concept={c.id} mode={mode} textScale={textScale} />
      <p className={`takeaway ${c.id === 'B' ? 'recommended' : ''}`}>{c.takeaway}</p>
      <a className="open-preview" href={`?concept=${c.id}&state=${mode}`} target="_blank" rel="noreferrer">Open {c.id} on its own <ArrowUpRight size={16} /></a>
    </article>)}</div>
    <footer className="comparison-footer"><strong>What changed</strong><p>The nearest arrival leads. Boarding stops and walking estimates are larger. Bus-list ETAs explicitly refer to each vehicle’s next stop. Navigation is visual context; login opens a local preview.</p><p>All data is illustrative. This page makes no API requests and does not change the production app.</p></footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);

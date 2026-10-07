/** Mapbox rendering only; the parent owns route filters and all detail surfaces. */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import mapboxgl, { type GeoJSONSource } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Coordinate, Journey, LiveVehicle, RouteId, Stop } from '../types';
import { ROUTE_COLORS, ROUTE_IDS } from '../data/routes';
import { createRouteInterpolator, type LngLat } from '../utils/routeInterpolation';
import { reportAgeSec, reportedPosition, stepBus, type BusMotion } from '../utils/liveVehicleAnimation';
import { boundedInsets, projectedOffsetPath, mergeMapStops, shiftedDashArray, splitSharedCorridors, stopsWithinHitArea, type RouteArrow, type ViewportInsets } from '../utils/mapPresentation';

const empty = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] });
const point = (coordinates: LngLat, properties: Record<string, unknown> = {}): GeoJSON.Feature<GeoJSON.Point> => ({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties });
const collection = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });
const lineFeature = (coordinates: LngLat[], properties: Record<string, unknown> = {}): GeoJSON.Feature<GeoJSON.LineString> => ({ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties });
const campus: LngLat = [-79.0469, 35.9049];
const font = ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'];
const motionDuration = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650;
const BUS_IMAGES: Record<RouteId, string> = { P2P_EXPRESS: '/icons/bus-express-top.png', BAITY_HILL: '/icons/bus-baity-top.png' };
/** [zoom, size] stops for the route arrow dots. */
const ARROW_SIZES: [number, number][] = [[14, .5], [15, .75], [16, 1], [17, 1.25], [18, 1.5]];
/** [zoom, scale] stops for the bus images: smaller zoomed out, larger zoomed in. */
const BUS_SCALES: [number, number][] = [[13, .625], [15, .9], [18, 1.45]];
/** Flowing route lines: short white dashes (in line widths) that march toward each route's end. */
const FLOW_DASH = 2, FLOW_GAP = 22, FLOW_STEP = .5, FLOW_FRAME_MS = 120;
/** Flowing lines and the live-bus pulse only show when zoomed in close. */
const DETAIL_ZOOM = 16;
/** Longest gap between frames the bus animation steps through; after a longer one (a background tab) buses jump or race to where they are. */
const MAX_FRAME_SEC = 2;
/** Recent snapshots used to estimate the client-minus-server clock offset. */
const CLOCK_SAMPLES = 10;
/** The blue dot glides to each new GPS reading over this long (phones send about one a second). */
const USER_GLIDE_MS = 1000;
const FLOW_SEQUENCE = Array.from({ length: (FLOW_DASH + FLOW_GAP) / FLOW_STEP }, (_, i) => shiftedDashArray(FLOW_DASH, FLOW_GAP, i * FLOW_STEP));
function busScale(zoom: number): number {
  const i = BUS_SCALES.findIndex(([z]) => z >= zoom);
  if (i <= 0) return BUS_SCALES[i === 0 ? 0 : BUS_SCALES.length - 1][1];
  const [z0, s0] = BUS_SCALES[i - 1], [z1, s1] = BUS_SCALES[i];
  return s0 + (s1 - s0) * (zoom - z0) / (z1 - z0);
}

/** HiDPI native sprites avoid network races and remain crisp at normal marker sizes. */
function stopSprite(): ImageData {
  const size = 30, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * 2;
  const c = canvas.getContext('2d')!; c.scale(2, 2);
  c.beginPath(); c.roundRect(1, 1, size - 2, size - 2, 8);
  c.fillStyle = '#203f50'; c.fill();
  c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
  c.strokeStyle = '#fff'; c.lineWidth = 1.4; c.beginPath(); c.roundRect(9, 7, 12, 15, 2); c.stroke();
  c.strokeRect(11, 9, 8, 6); c.fillStyle = '#fff'; c.fillRect(11, 18, 2, 2); c.fillRect(17, 18, 2, 2);
  c.fillRect(10, 22, 2, 2); c.fillRect(18, 22, 2, 2);
  return c.getImageData(0, 0, canvas.width, canvas.height);
}
/** Route-colored dot with a white chevron pointing east; rotated per placement.
 * Drawn at 4x so it stays sharp when zoomed in to 1.5x size. */
function arrowDotSprite(color: string): ImageData {
  const size = 20, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * 4;
  const c = canvas.getContext('2d')!; c.scale(4, 4);
  c.beginPath(); c.arc(10, 10, 8.5, 0, Math.PI * 2);
  c.fillStyle = color; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
  c.lineWidth = 2.4; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(8, 6); c.lineTo(12.5, 10); c.lineTo(8, 14); c.stroke();
  return c.getImageData(0, 0, canvas.width, canvas.height);
}

export interface MapCamera {
  zoom: (delta: number) => void;
  recenter: () => void;
  overview: () => void;
  focus: () => void;
}
export interface MapboxMapProps {
  active: boolean;
  vehicles: LiveVehicle[];
  vehiclesReceivedAt: number | null;
  /** Server time the feed was read, for timing each bus from its own GPS report. */
  vehiclesFetchedAt: string | null;
  routeLines: Record<RouteId, LngLat[]>;
  patternLines: Record<number, LngLat[]>;
  routeStops: Record<RouteId, Stop[]>;
  enabledRouteIds: RouteId[];
  userLocation: Coordinate | null;
  highlightedStopId: string | null;
  focusStopId: string | null;
  viewportInsets: ViewportInsets;
  activeJourney: Journey | null;
  onSelectBus: (bus: LiveVehicle) => void;
  onStopCandidates: (stops: Stop[]) => void;
  onMapClick: () => void;
  enable3D: boolean;
  centerOnCampusAt?: number | null;
  routeArrows: Record<RouteId, RouteArrow[]>;
}

export const MapboxMap = forwardRef<MapCamera, MapboxMapProps>(function MapboxMap(props: MapboxMapProps, ref) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialFramed = useRef(false);
  const markers = useRef(new Map<string, { marker: mapboxgl.Marker; element: HTMLButtonElement; motion: BusMotion | null; drawn: BusMotion | null; label: string }>());
  const clockOffsets = useRef<number[]>([]);
  /** The rider's dot: where it is drawn and the glide toward the newest reading. */
  const user = useRef<{ marker: mapboxgl.Marker; from: LngLat; to: LngLat; start: number } | null>(null);
  const mapStops = useMemo(() => mergeMapStops(props.routeStops, props.enabledRouteIds), [props.routeStops, props.enabledRouteIds]);
  const chunks = useMemo(() => ({
    P2P_EXPRESS: props.routeLines.P2P_EXPRESS.length > 1 ? [{ coordinates: props.routeLines.P2P_EXPRESS, offset: 0 }] : [],
    BAITY_HILL: splitSharedCorridors(props.routeLines.BAITY_HILL, props.routeLines.P2P_EXPRESS, props.enabledRouteIds.includes('P2P_EXPRESS')),
  }), [props.routeLines, props.enabledRouteIds]);
  const latest = useRef({ ...props, mapStops, chunks }); latest.current = { ...props, mapStops, chunks };
  const displayedRoutes = useRef<Record<RouteId, LngLat[]>>({ P2P_EXPRESS: [], BAITY_HILL: [] });
  const interpolators = useMemo(() => new Map((Object.entries(props.patternLines) as [string, LngLat[]][]).map(([id, coords]) => [Number(id), createRouteInterpolator(coords)])), [props.patternLines]);
  const interpolatorsRef = useRef(interpolators); interpolatorsRef.current = interpolators;
  const token = (import.meta as any).env?.VITE_MAPBOX_TOKEN;
  const padding = () => {
    const map = mapRef.current;
    return boundedInsets(latest.current.viewportInsets, map?.getContainer().clientWidth || 390, map?.getContainer().clientHeight || 700);
  };
  const overview = () => {
    const map = mapRef.current; if (!map || !map.getSource('routes')) return;
    const p = latest.current;
    const coords = p.enabledRouteIds.flatMap(id => p.routeLines[id]);
    if (!coords.length) { map.easeTo({ center: campus, zoom: 14, padding: padding(), duration: motionDuration() }); return; }
    const bounds = new mapboxgl.LngLatBounds(); coords.forEach(c => bounds.extend(c));
    map.fitBounds(bounds, { padding: padding(), maxZoom: 15, duration: motionDuration() });
  };
  useImperativeHandle(ref, () => ({
    zoom: delta => mapRef.current?.zoomTo((mapRef.current?.getZoom() ?? 14) + delta, { duration: motionDuration() }),
    recenter: () => {
      const location = latest.current.userLocation;
      if (location) mapRef.current?.easeTo({ center: [location.lon, location.lat], zoom: 16, padding: padding(), duration: motionDuration() });
      else overview();
    },
    overview,
    focus: () => mapRef.current?.getCanvas().focus(),
  }));

  useEffect(() => {
    if (!container.current || !token) return;
    let disposed = false;
    setReady(false); initialFramed.current = false;
    const map = new mapboxgl.Map({ container: container.current, accessToken: token, style: 'mapbox://styles/mapbox/streets-v12', center: campus, zoom: 14, attributionControl: false });
    mapRef.current = map;
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
    map.getCanvas().setAttribute('aria-label', 'Campus transit map. Use the stop list in Map options for keyboard navigation.');
    map.on('error', e => { if (!map.isStyleLoaded()) setError('The map could not load. Check your connection and try again.'); console.warn('Map rendering:', e.error.message); });
    map.on('load', () => {
      if (disposed) return;
      setError(null);
      map.addImage('stop-selected', stopSprite(), { pixelRatio: 2 });
      for (const id of ROUTE_IDS) map.addImage(`route-arrow-${id}`, arrowDotSprite(ROUTE_COLORS[id]), { pixelRatio: 4 });
      for (const id of ['routes', 'arrows', 'stops', 'journey', 'destination']) map.addSource(id, { type: 'geojson', data: empty() });
      map.addLayer({ id: 'routes-casing', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 6, 16, 8] } });
      map.addLayer({ id: 'routes-line', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 16, 6], 'line-opacity': .95 } });
      map.addLayer({ id: 'routes-flow', type: 'line', source: 'routes', minzoom: DETAIL_ZOOM, layout: { 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-opacity': .55, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 16, 2.5], 'line-dasharray': FLOW_SEQUENCE[0] } });
      map.addLayer({ id: 'journey-casing', type: 'line', source: 'journey', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 8 } });
      map.addLayer({ id: 'journey-bus', type: 'line', source: 'journey', filter: ['==', ['get', 'kind'], 'bus'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 6 } });
      map.addLayer({ id: 'journey-walk', type: 'line', source: 'journey', filter: ['==', ['get', 'kind'], 'walk'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#235e82', 'line-width': 3.5, 'line-dasharray': [0, 2] } });
      // Hidden when zoomed out past campus; fades in, then grows with each zoom step.
      map.addLayer({ id: 'arrows-mark', type: 'symbol', source: 'arrows', minzoom: 14, layout: { 'icon-image': ['get', 'icon'], 'icon-rotate': ['get', 'rotate'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
        'icon-size': ['interpolate', ['linear'], ['zoom'], ...ARROW_SIZES.flat()],
        // icon-offset is scaled by icon-size; divide so shifted Baity arrows stay on its 7 px lane.
        'icon-offset': ['interpolate', ['linear'], ['zoom'], ...ARROW_SIZES.flatMap(([zoom, size]) => [zoom, ['case', ['get', 'shifted'], ['literal', [0, 7 / size]], ['literal', [0, 0]]]])] },
        paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.6, 1] } } as mapboxgl.SymbolLayerSpecification);
      map.addLayer({ id: 'stops-mark', type: 'symbol', source: 'stops', filter: ['==', ['get', 'selected'], false], layout: { 'icon-image': 'stop-selected', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': 18 / 30 }, paint: { 'icon-opacity': ['get', 'opacity'] } });
      map.addLayer({ id: 'stop-labels', type: 'symbol', source: 'stops', minzoom: 16, filter: ['==', ['get', 'selected'], false], layout: { 'text-field': ['get', 'name'], 'text-font': font, 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, .9], 'text-padding': 8, 'text-max-width': 10 }, paint: { 'text-color': '#4b6573', 'text-halo-color': '#fff', 'text-halo-width': 2, 'text-opacity': ['get', 'opacity'] } });
      map.addLayer({ id: 'selected-stop', type: 'symbol', source: 'stops', filter: ['==', ['get', 'selected'], true], layout: { 'icon-image': 'stop-selected', 'icon-size': 27 / 30, 'icon-allow-overlap': true, 'text-field': ['get', 'name'], 'text-font': font, 'text-size': 12, 'text-anchor': 'bottom', 'text-offset': [0, -1.65], 'text-max-width': 12, 'text-allow-overlap': true }, paint: { 'text-color': '#203f50', 'text-halo-color': '#fff', 'text-halo-width': 3 } });
      map.addLayer({ id: 'destination-mark', type: 'symbol', source: 'destination', layout: { 'icon-image': 'stop-selected', 'icon-size': 27 / 30, 'icon-allow-overlap': true, 'text-field': ['get', 'name'], 'text-font': font, 'text-size': 12, 'text-anchor': 'bottom', 'text-offset': [0, -1.65], 'text-max-width': 12 }, paint: { 'text-color': '#203f50', 'text-halo-color': '#fff', 'text-halo-width': 3 } });
      map.addLayer({ id: 'campus-buildings-3d', type: 'fill-extrusion', source: 'composite', 'source-layer': 'building', minzoom: 14, layout: { visibility: 'none' }, paint: { 'fill-extrusion-color': '#d8ddcf', 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': ['get', 'min_height'], 'fill-extrusion-opacity': .65 } }, 'routes-casing');
      setReady(true);
    });
    const click = (e: mapboxgl.MapMouseEvent) => {
      const p = latest.current;
      const candidates = stopsWithinHitArea<{ stop: Stop; point: { x: number; y: number } }>(p.mapStops.map(stop => ({ stop, point: map.project([stop.lon, stop.lat]) })), e.point).map(s => s.stop);
      if (candidates.length) p.onStopCandidates(candidates); else p.onMapClick();
    };
    map.on('click', click);
    // Bus markers are HTML, so they read their size from this variable (see campus-map.css).
    const scaleBuses = () => {
      map.getContainer().style.setProperty('--bus-scale', busScale(map.getZoom()).toFixed(3));
      map.getContainer().classList.toggle('show-bus-pulse', map.getZoom() >= DETAIL_ZOOM);
    };
    scaleBuses(); map.on('zoom', scaleBuses);
    const resize = new ResizeObserver(() => { if (latest.current.active) map.resize(); }); resize.observe(container.current);
    return () => {
      disposed = true; resize.disconnect();
      for (const entry of markers.current.values()) entry.marker.remove();
      markers.current.clear(); user.current?.marker.remove(); user.current = null; map.remove(); mapRef.current = null;
    };
  }, [token]);

  // Camera changes affect the pixel offset; transit snapshots do not. Keep the
  // casing, colored stroke and arrow centerline on exactly the same coordinates.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getSource('routes')) return;
    const redraw = () => {
      const p = latest.current;
      let baity = p.routeLines.BAITY_HILL;
      if (p.enabledRouteIds.includes('P2P_EXPRESS') && p.enabledRouteIds.includes('BAITY_HILL')) {
        const coordinates = projectedOffsetPath(p.chunks.BAITY_HILL, c => map.project(c), pt => {
          const ll = map.unproject([pt.x, pt.y]); return [ll.lng, ll.lat];
        });
        // Keep a connected, separated lane even when the tilted camera cannot
        // invert an offscreen point. Mercator pixels have no perspective horizon.
        const worldSize = 512 * 2 ** map.getZoom();
        baity = coordinates ?? projectedOffsetPath(p.chunks.BAITY_HILL, c => {
          const m = mapboxgl.MercatorCoordinate.fromLngLat(c);
          return { x: m.x * worldSize, y: m.y * worldSize };
        }, pt => {
          const ll = new mapboxgl.MercatorCoordinate(pt.x / worldSize, pt.y / worldSize).toLngLat();
          return [ll.lng, ll.lat];
        }) ?? baity;
      }
      displayedRoutes.current = { P2P_EXPRESS: p.routeLines.P2P_EXPRESS, BAITY_HILL: baity };
      (map.getSource('routes') as GeoJSONSource).setData(collection(p.enabledRouteIds.flatMap(id => {
        const coords = displayedRoutes.current[id];
        return coords.length > 1 ? [lineFeature(coords, { color: ROUTE_COLORS[id] })] : [];
      })));
    };
    redraw();
    map.on('move', redraw); map.on('resize', redraw);
    return () => { map.off('move', redraw); map.off('resize', redraw); };
  }, [ready, chunks, props.enabledRouteIds]);

  useEffect(() => {
    const map = mapRef.current; if (!ready || !map?.getSource('routes')) return;
    const set = (id: string, features: GeoJSON.Feature[]) => (map.getSource(id) as GeoJSONSource).setData(collection(features));
    set('stops', mapStops.map(s => point([s.lon, s.lat], { id: s.id, name: s.name, selected: s.id === props.highlightedStopId, opacity: props.activeJourney && s.id !== props.highlightedStopId ? .35 : 1 })));
    // Never fabricate a straight walking line when the directions request failed.
    set('journey', (props.activeJourney?.segments ?? []).flatMap(seg => {
      const geometry = seg.type === 'walk' ? seg.geometry : seg.busSegmentGeometry;
      return geometry?.coordinates.length > 1 ? [lineFeature(geometry.coordinates, { kind: seg.type, color: seg.routeId ? ROUTE_COLORS[seg.routeId as RouteId] : '#235e82' })] : [];
    }));
    set('destination', props.activeJourney ? [point([props.activeJourney.destination.lon, props.activeJourney.destination.lat], { name: props.activeJourney.destination.name })] : []);
    map.setPaintProperty('routes-line', 'line-opacity', props.activeJourney ? .4 : .95);
    map.setPaintProperty('routes-flow', 'line-opacity', props.activeJourney ? 0 : .55);
  }, [ready, mapStops, props.highlightedStopId, props.activeJourney]);

  // March the flow dashes along the routes. Off for reduced motion.
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready || !props.active || !map.getLayer('routes-flow')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { map.setLayoutProperty('routes-flow', 'visibility', 'none'); return; }
    let frame = 0, step = 0, last = 0, stopped = false;
    const animate = (time: number) => {
      if (stopped) return;
      if (time - last >= FLOW_FRAME_MS && map.getZoom() >= DETAIL_ZOOM) {
        last = time; step = (step + 1) % FLOW_SEQUENCE.length;
        map.setPaintProperty('routes-flow', 'line-dasharray', FLOW_SEQUENCE[step]);
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => { stopped = true; cancelAnimationFrame(frame); };
  }, [ready, props.active]);

  // Fixed to places on each route: set once per route change, never per camera move.
  useEffect(() => {
    const map = mapRef.current; if (!ready || !map?.getSource('arrows')) return;
    const expressShown = props.enabledRouteIds.includes('P2P_EXPRESS');
    (map.getSource('arrows') as GeoJSONSource).setData(collection(props.activeJourney ? [] : props.enabledRouteIds.flatMap(id =>
      // On shared roads Baity is drawn 7 px to the right of its travel direction; follow it.
      props.routeArrows[id].map(a => point(a.coordinates, { icon: `route-arrow-${id}`, rotate: a.bearing - 90, shifted: id === 'BAITY_HILL' && expressShown && a.shared })))));
  }, [ready, props.routeArrows, props.enabledRouteIds, props.activeJourney]);

  // The rider's dot is HTML so it can glide between GPS readings in the frame loop below.
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    const location = props.userLocation;
    if (!location) { user.current?.marker.remove(); user.current = null; return; }
    const to: LngLat = [location.lon, location.lat];
    if (!user.current) {
      const element = document.createElement('div'); element.className = 'campus-user'; element.setAttribute('aria-hidden', 'true');
      user.current = { marker: new mapboxgl.Marker({ element, anchor: 'center' }).setLngLat(to).addTo(map), from: to, to, start: 0 };
      return;
    }
    const drawn = user.current.marker.getLngLat();
    user.current = { ...user.current, from: [drawn.lng, drawn.lat], to, start: performance.now() };
  }, [ready, props.userLocation]);

  useEffect(() => {
    // The server caches the feed, so a snapshot can arrive a few seconds after it was read;
    // the smallest recent gap is the closest to the true clock difference.
    const fetched = props.vehiclesFetchedAt ? Date.parse(props.vehiclesFetchedAt) : NaN;
    if (props.vehiclesReceivedAt == null || !Number.isFinite(fetched)) return;
    clockOffsets.current = [...clockOffsets.current, props.vehiclesReceivedAt - fetched].slice(-CLOCK_SAMPLES);
  }, [props.vehiclesReceivedAt, props.vehiclesFetchedAt]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !ready || !props.active || !map.getSource('routes')) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, last = performance.now();
    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(Math.max(time - last, 0) / 1000, MAX_FRAME_SEC); last = time;
      const p = latest.current, now = Date.now();
      const offset = clockOffsets.current.length ? Math.min(...clockOffsets.current) : null;
      const glide = user.current;
      if (glide && glide.start) {
        const t = reducedMotion.matches ? 1 : Math.min(1, (time - glide.start) / USER_GLIDE_MS);
        glide.marker.setLngLat([glide.from[0] + (glide.to[0] - glide.from[0]) * t, glide.from[1] + (glide.to[1] - glide.from[1]) * t]);
        if (t === 1) glide.start = 0;
      }
      const visible = p.vehicles.filter(v => p.enabledRouteIds.includes(v.routeId));
      for (const [id, entry] of markers.current) if (!visible.some(v => v.id === id)) { entry.marker.remove(); markers.current.delete(id); }
      for (const v of visible) {
        let entry = markers.current.get(v.id);
        if (!entry) {
          const element = document.createElement('button'); element.type = 'button'; element.className = 'campus-bus';
          // Top-down bus, front at the top of the image; lies flat and turns with its heading.
          // Soft ring pulsing behind live buses; hidden while a bus is stale (see campus-map.css).
          const pulse = document.createElement('span'); pulse.className = 'campus-bus-pulse'; element.appendChild(pulse);
          element.style.setProperty('--bus-color', ROUTE_COLORS[v.routeId]);
          const image = document.createElement('img'); image.src = BUS_IMAGES[v.routeId]; image.alt = ''; element.appendChild(image);
          element.addEventListener('click', e => { e.stopPropagation(); const current = latest.current.vehicles.find(bus => bus.id === v.id); if (current) latest.current.onSelectBus(current); });
          const marker = new mapboxgl.Marker({ element, anchor: 'center', rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([v.lon, v.lat]).addTo(map);
          element.setAttribute('role', 'button');
          entry = { marker, element, motion: null, drawn: null, label: '' }; markers.current.set(v.id, entry);
        }
        const motion = reducedMotion.matches ? reportedPosition(v)
          : stepBus(entry.motion, v, interpolatorsRef.current.get(v.patternId ?? NaN) ?? null, reportAgeSec(v, now, offset, p.vehiclesReceivedAt), dt);
        entry.motion = motion;
        const drawn = entry.drawn;
        const turned = !drawn || Math.abs(drawn.bearing - motion.bearing) >= .05;
        if (turned || Math.abs(drawn.lon - motion.lon) > 1e-8 || Math.abs(drawn.lat - motion.lat) > 1e-8) {
          // Mapbox snaps a marker to a whole pixel on setRotation but not on setLngLat, so rotate
          // first; a bus moved every frame then slides smoothly instead of stepping pixel by pixel.
          if (turned) entry.marker.setRotation(motion.bearing);
          entry.marker.setLngLat([motion.lon, motion.lat]);
          entry.drawn = motion;
        }
        const label = `${v.routeName}, ${v.name}${v.stale ? ', location not updating' : ''}`;
        if (label !== entry.label) {
          entry.label = label;
          entry.element.setAttribute('aria-label', label);
          entry.element.classList.toggle('stale', v.stale);
        }
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready, props.active]);

  useEffect(() => {
    if (ready && props.active) mapRef.current?.resize();
  }, [ready, props.active]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !ready || !map.getSource('routes')) return;
    map.setPadding(padding());
  }, [ready, props.viewportInsets]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !ready || !map.getSource('routes') || initialFramed.current) return;
    if (!props.routeLines.P2P_EXPRESS.length && !props.routeLines.BAITY_HILL.length) return;
    initialFramed.current = true;
    if (props.activeJourney || props.focusStopId) return;
    if (props.userLocation) map.easeTo({ center: [props.userLocation.lon, props.userLocation.lat], zoom: 15.5, padding: padding(), duration: motionDuration() });
    else overview();
  }, [ready, props.routeLines, props.userLocation]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !ready || !map.getSource('routes')) return;
    if (props.activeJourney) {
      const bounds = new mapboxgl.LngLatBounds();
      props.activeJourney.segments.forEach(s => { bounds.extend([s.fromCoords.lon, s.fromCoords.lat]); bounds.extend([s.toCoords.lon, s.toCoords.lat]); (s.geometry ?? s.busSegmentGeometry)?.coordinates.forEach(c => bounds.extend(c)); });
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: padding(), maxZoom: 17, duration: motionDuration() });
    } else if (props.focusStopId) {
      const s = latest.current.mapStops.find(stop => stop.id === props.focusStopId);
      if (s) map.easeTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 15.5), padding: padding(), duration: motionDuration() });
    }
  }, [ready, props.focusStopId, props.activeJourney, props.viewportInsets]);

  useEffect(() => { if (ready && props.centerOnCampusAt != null) overview(); }, [ready, props.centerOnCampusAt]);
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready || !map.getSource('routes')) return;
    const pitch = props.enable3D ? 50 : 0;
    if (map.getPitch() !== pitch) map.easeTo({ pitch, duration: motionDuration() });
    map.setLayoutProperty('campus-buildings-3d', 'visibility', props.enable3D ? 'visible' : 'none');
  }, [ready, props.enable3D]);

  return <>
    <div ref={container} className="campus-map-canvas" />
    {(!token || error) && <div role="status" className="absolute inset-0 flex items-center justify-center p-8 bg-slate-100 text-sm text-slate-600 text-center">{!token ? 'Map unavailable. Configure the Mapbox access token to view campus.' : error}</div>}
  </>;
});

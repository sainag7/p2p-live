/**
 * Mapbox GL JS map (student map view). Replaces Leaflet.
 * Single init on mount; updates via source.setData. No globe mode.
 * Route polylines from server proxy (/api/mapbox/route); stops from p2pStops.
 * Buses are snapped to route geometry and animated along it.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Map as MapboxMapType, GeoJSONSource } from 'mapbox-gl';
import { Stop, Vehicle, Coordinate, Journey } from '../types';
import { P2P_EXPRESS_STOPS, BAITY_HILL_STOPS } from '../data/p2pStops';
import { createRouteInterpolator, type LngLat } from '../utils/routeInterpolation';
import { Navigation } from 'lucide-react';

type GeoJSONFC = { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; geometry: { type: 'Point'; coordinates: number[] } | { type: 'LineString'; coordinates: [number, number][] }; properties: Record<string, unknown> }> };

const CHAPEL_HILL: [number, number] = [-79.05, 35.9132];
const DEFAULT_ZOOM = 13;
const USER_ZOOM = 16;
const PITCH_3D = 60;

const P2P_EXPRESS_LINE_SOURCE = 'p2p-express-line-source';
const BAITY_HILL_LINE_SOURCE = 'baity-hill-line-source';
const P2P_EXPRESS_STOPS_SOURCE = 'p2p-express-stops-source';
const BAITY_HILL_STOPS_SOURCE = 'baity-hill-stops-source';
const P2P_EXPRESS_LINE_LAYER = 'p2p-express-line-layer';
const BAITY_HILL_LINE_LAYER = 'baity-hill-line-layer';
const EXPRESS_ARROWS_LAYER = 'express-arrows';
const BAITY_ARROWS_LAYER = 'baity-arrows';
const P2P_EXPRESS_STOPS_LAYER = 'p2p-express-stops-layer';
const BAITY_HILL_STOPS_LAYER = 'baity-hill-stops-layer';
const BUSES_SOURCE = 'buses-source';
const USER_SOURCE = 'user-source';
const JOURNEY_SOURCE = 'journey-source';
const BUSES_LAYER = 'buses-layer';
const USER_LAYER = 'user-layer';
const USER_HALO_LAYER = 'user-halo-layer';
const JOURNEY_LAYER = 'journey-layer';

const ROUTE_COLORS = { P2P_EXPRESS: '#418FC5', BAITY_HILL: '#C33934' } as const;
const BUS_SPEED_MPS = 6;
const TICK_MS = 300;

/** Create a small arrow image (right-pointing) for route direction. Mapbox often fails to load SVG. */
function createArrowImageData(): { width: number; height: number; data: Uint8Array | Uint8ClampedArray } {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = '#333';
  ctx.fillStyle = '#333';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(8, 6);
  ctx.lineTo(24, 16);
  ctx.lineTo(8, 26);
  ctx.stroke();
  const id = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: id.data };
}

/** Create a simple bus shape for bus icon. */
function createBusImageData(): { width: number; height: number; data: Uint8Array | Uint8ClampedArray } {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#333';
  ctx.fillRect(6, 10, 20, 12);
  ctx.fillStyle = '#fff';
  ctx.fillRect(8, 12, 4, 4);
  ctx.fillRect(14, 12, 4, 4);
  ctx.fillRect(20, 12, 4, 4);
  const id = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: id.data };
}

function emptyFC(): GeoJSONFC {
  return { type: 'FeatureCollection', features: [] };
}

function routeStopsToGeoJSON(
  routeStops: { id: string; name: string; lat: number; lon: number }[],
  selectedId: string | null
): GeoJSONFC {
  return {
    type: 'FeatureCollection',
    features: routeStops.map((s) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
      properties: { id: s.id, name: s.name, selected: s.id === selectedId },
    })),
  };
}

function emptyLineGeoJSON(): { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; geometry: { type: 'LineString'; coordinates: [number, number][] }; properties: object }> } {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} }],
  };
}

/** GeoJSON for buses (points with busId, routeId, bearing for symbol rotation). */
function busesToGeoJSON(
  busPositions: { id: string; routeId: string; lon: number; lat: number; bearing: number }[]
): GeoJSONFC {
  return {
    type: 'FeatureCollection',
    features: busPositions.map((b) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [b.lon, b.lat] },
      properties: { busId: b.id, routeId: b.routeId, bearing: b.bearing },
    })),
  };
}

function userToGeoJSON(c: Coordinate | null): GeoJSONFC {
  if (!c) return emptyFC();
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] }, properties: {} }],
  };
}

function journeyToGeoJSON(j: Journey | null): GeoJSONFC {
  if (!j || !j.segments.length) return emptyFC();
  const coords: [number, number][] = [];
  j.segments.forEach((seg) => {
    if (!coords.length) coords.push([seg.fromCoords.lon, seg.fromCoords.lat]);
    coords.push([seg.toCoords.lon, seg.toCoords.lat]);
  });
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: coords }, properties: {} }],
  };
}

export interface MapboxMapProps {
  stops: Stop[];
  vehicles: Vehicle[];
  userLocation: Coordinate | null;
  userLocationResolved?: boolean;
  selectedStopId: string | null;
  activeJourney: Journey | null;
  onSelectBus: (bus: Vehicle) => void;
  onSelectStop: (stop: Stop) => void;
  enable3D?: boolean;
  className?: string;
}

export const MapboxMap: React.FC<MapboxMapProps> = ({
  stops,
  vehicles,
  userLocation,
  userLocationResolved = false,
  selectedStopId,
  activeJourney,
  onSelectBus,
  onSelectStop,
  enable3D = false,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMapType | null>(null);
  const flownToUserRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [showExpress, setShowExpress] = useState(true);
  const [showBaity, setShowBaity] = useState(true);
  const routeGeomsRef = useRef<{ P2P_EXPRESS: LngLat[]; BAITY_HILL: LngLat[] }>({
    P2P_EXPRESS: [],
    BAITY_HILL: [],
  });
  const interpolatorsRef = useRef<{
    P2P_EXPRESS: ReturnType<typeof createRouteInterpolator> | null;
    BAITY_HILL: ReturnType<typeof createRouteInterpolator> | null;
  }>({ P2P_EXPRESS: null, BAITY_HILL: null });
  const busDistMetersRef = useRef<Record<string, number>>({});
  const lastTickRef = useRef<number>(0);

  const token = typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_MAPBOX_TOKEN;
  const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV;

  useEffect(() => {
    if (!containerRef.current || !token) return;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      accessToken: token,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: CHAPEL_HILL,
      zoom: DEFAULT_ZOOM,
      pitch: 0,
      bearing: 0,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');

    map.on('load', () => {
      try {
        map.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        });
      } catch {
        /* style may not support */
      }

      // Route lines (behind everything)
      map.addSource(P2P_EXPRESS_LINE_SOURCE, { type: 'geojson', data: emptyLineGeoJSON() });
      map.addSource(BAITY_HILL_LINE_SOURCE, { type: 'geojson', data: emptyLineGeoJSON() });
      map.addLayer({
        id: P2P_EXPRESS_LINE_LAYER,
        type: 'line',
        source: P2P_EXPRESS_LINE_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ROUTE_COLORS.P2P_EXPRESS, 'line-width': 4, 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: BAITY_HILL_LINE_LAYER,
        type: 'line',
        source: BAITY_HILL_LINE_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ROUTE_COLORS.BAITY_HILL, 'line-width': 4, 'line-opacity': 0.9 },
      });

      // Direction arrows: use canvas-generated image (Mapbox loadImage often fails for SVG)
      const arrowImg = createArrowImageData();
      map.addImage('route-arrow', arrowImg, { sdf: false });
      // Fewer arrows: spacing 140 default; zoom-dependent (more when zoomed in)
      map.addLayer({
        id: EXPRESS_ARROWS_LAYER,
        type: 'symbol',
        source: P2P_EXPRESS_LINE_SOURCE,
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 10, 160, 14, 130, 17, 100],
          'icon-image': 'route-arrow',
          'icon-size': 0.6,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
        },
        paint: {},
      });
      map.addLayer({
        id: BAITY_ARROWS_LAYER,
        type: 'symbol',
        source: BAITY_HILL_LINE_SOURCE,
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 10, 160, 14, 130, 17, 100],
          'icon-image': 'route-arrow',
          'icon-size': 0.6,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
        },
        paint: {},
      });

      if (isDev) {
        setTimeout(() => {
          const hasArrow = map.hasImage('route-arrow');
          const hasExpressArrows = !!map.getLayer(EXPRESS_ARROWS_LAYER);
          const hasBaityArrows = !!map.getLayer(BAITY_ARROWS_LAYER);
          const hasExpressSource = !!map.getSource(P2P_EXPRESS_LINE_SOURCE);
          const hasBaitySource = !!map.getSource(BAITY_HILL_LINE_SOURCE);
          console.log('[Mapbox route arrows]', {
            'map.hasImage("route-arrow")': hasArrow,
            [`map.getLayer("${EXPRESS_ARROWS_LAYER}")`]: hasExpressArrows,
            [`map.getLayer("${BAITY_ARROWS_LAYER}")`]: hasBaityArrows,
            [`map.getSource("${P2P_EXPRESS_LINE_SOURCE}")`]: hasExpressSource,
            [`map.getSource("${BAITY_HILL_LINE_SOURCE}")`]: hasBaitySource,
          });
          const hasBusesSource = !!map.getSource(BUSES_SOURCE);
          const hasBusesLayer = !!map.getLayer(BUSES_LAYER);
          const hasBusIcon = map.hasImage('bus-icon');
          console.log('[Mapbox buses]', {
            [`map.getSource("${BUSES_SOURCE}")`]: hasBusesSource,
            [`map.getLayer("${BUSES_LAYER}")`]: hasBusesLayer,
            'map.hasImage("bus-icon")': hasBusIcon,
          });
        }, 500);
      }

      // Per-route stop circles
      map.addSource(P2P_EXPRESS_STOPS_SOURCE, { type: 'geojson', data: emptyFC() });
      map.addSource(BAITY_HILL_STOPS_SOURCE, { type: 'geojson', data: emptyFC() });
      map.addLayer({
        id: P2P_EXPRESS_STOPS_LAYER,
        type: 'circle',
        source: P2P_EXPRESS_STOPS_SOURCE,
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 9, 7],
          'circle-color': ['case', ['get', 'selected'], ROUTE_COLORS.P2P_EXPRESS, '#fff'],
          'circle-stroke-width': ['case', ['get', 'selected'], 3, 2],
          'circle-stroke-color': ['case', ['get', 'selected'], '#fff', '#64748b'],
        },
      });
      map.addLayer({
        id: BAITY_HILL_STOPS_LAYER,
        type: 'circle',
        source: BAITY_HILL_STOPS_SOURCE,
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 9, 7],
          'circle-color': ['case', ['get', 'selected'], ROUTE_COLORS.BAITY_HILL, '#fff'],
          'circle-stroke-width': ['case', ['get', 'selected'], 3, 2],
          'circle-stroke-color': ['case', ['get', 'selected'], '#fff', '#64748b'],
        },
      });

      map.addSource(BUSES_SOURCE, { type: 'geojson', data: emptyFC() });
      map.addSource(USER_SOURCE, { type: 'geojson', data: emptyFC() });
      map.addSource(JOURNEY_SOURCE, { type: 'geojson', data: emptyFC() });

      let busIconAdded = false;
      try {
        const busImg = createBusImageData();
        map.addImage('bus-icon', busImg, { sdf: false });
        busIconAdded = true;
      } catch (e) {
        if (isDev) console.warn('[Mapbox buses] bus-icon addImage failed', e);
      }

      map.addLayer({
        id: BUSES_LAYER,
        type: busIconAdded ? 'symbol' : 'circle',
        source: BUSES_SOURCE,
        ...(busIconAdded
          ? {
              layout: {
                'icon-image': 'bus-icon',
                'icon-size': 0.55,
                'icon-rotate': ['get', 'bearing'],
                'icon-rotation-alignment': 'map',
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
              },
              paint: {},
            }
          : {
              paint: {
                'circle-radius': 10,
                'circle-color': ['case', ['==', ['get', 'routeId'], 'p2p-express'], '#418FC5', '#C33934'],
                'circle-stroke-width': 2,
                'circle-stroke-color': '#fff',
              },
            }),
      });

      map.addLayer({
        id: USER_HALO_LAYER,
        type: 'circle',
        source: USER_SOURCE,
        paint: { 'circle-radius': 12, 'circle-color': 'rgba(66, 133, 244, 0.25)' },
      });
      map.addLayer({
        id: USER_LAYER,
        type: 'circle',
        source: USER_SOURCE,
        paint: {
          'circle-radius': 6,
          'circle-color': '#4285F4',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });
      map.addLayer({
        id: JOURNEY_LAYER,
        type: 'line',
        source: JOURNEY_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#418FC5', 'line-width': 5, 'line-opacity': 0.8 },
      });

      setMapReady(true);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !userLocationResolved || !userLocation || flownToUserRef.current) return;
    flownToUserRef.current = true;
    map.flyTo({
      center: [userLocation.lon, userLocation.lat],
      zoom: USER_ZOOM,
      pitch: enable3D ? PITCH_3D : 0,
      duration: 1500,
      essential: true,
    });
  }, [mapReady, userLocationResolved, userLocation, enable3D]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const expressStops = map.getSource(P2P_EXPRESS_STOPS_SOURCE) as GeoJSONSource | undefined;
    const baityStops = map.getSource(BAITY_HILL_STOPS_SOURCE) as GeoJSONSource | undefined;
    const u = map.getSource(USER_SOURCE) as GeoJSONSource | undefined;
    const j = map.getSource(JOURNEY_SOURCE) as GeoJSONSource | undefined;
    if (expressStops) expressStops.setData(routeStopsToGeoJSON(P2P_EXPRESS_STOPS, selectedStopId));
    if (baityStops) baityStops.setData(routeStopsToGeoJSON(BAITY_HILL_STOPS, selectedStopId));
    if (u) u.setData(userToGeoJSON(userLocation));
    if (j) j.setData(journeyToGeoJSON(activeJourney));
    // Buses are updated by the animation tick (route-snapped positions)
  }, [mapReady, selectedStopId, userLocation, activeJourney]);

  // Fetch route polylines from server proxy (cached); store geometry for bus interpolation
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const base = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_OPS_API_URL) || '';
    (['P2P_EXPRESS', 'BAITY_HILL'] as const).forEach((routeId) => {
      fetch(`${base}/api/mapbox/route?routeId=${routeId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))))
        .then((data: { geometry?: { type: string; coordinates: [number, number][] }; routeId: string }) => {
          if (!data.geometry || !data.geometry.coordinates.length) return;
          const coords = data.geometry.coordinates as LngLat[];
          if (routeId === 'P2P_EXPRESS') {
            routeGeomsRef.current.P2P_EXPRESS = coords;
            interpolatorsRef.current.P2P_EXPRESS = createRouteInterpolator(coords);
          } else {
            routeGeomsRef.current.BAITY_HILL = coords;
            interpolatorsRef.current.BAITY_HILL = createRouteInterpolator(coords);
          }
          const sourceId = routeId === 'P2P_EXPRESS' ? P2P_EXPRESS_LINE_SOURCE : BAITY_HILL_LINE_SOURCE;
          const src = map.getSource(sourceId) as GeoJSONSource | undefined;
          if (src) {
            src.setData({
              type: 'FeatureCollection',
              features: [{
                type: 'Feature',
                geometry: { type: 'LineString' as const, coordinates: data.geometry!.coordinates },
                properties: {},
              }],
            });
          }
        })
        .catch((err) => console.warn('Route fetch failed', routeId, err));
    });
  }, [mapReady]);

  // Bus animation: snap to route, advance distMeters each tick, update buses source
  useEffect(() => {
    if (!mapReady || !mapRef.current || !vehicles.length) return;
    const map = mapRef.current;
    const interp = interpolatorsRef.current;
    const routeIdToKey = (id: string) => (id === 'p2p-express' ? 'P2P_EXPRESS' : 'BAITY_HILL');

    const initBusDist = (v: Vehicle) => {
      const key = routeIdToKey(v.routeId);
      const ip = key === 'P2P_EXPRESS' ? interp.P2P_EXPRESS : interp.BAITY_HILL;
      if (ip && busDistMetersRef.current[v.id] === undefined) {
        const total = ip.totalLengthMeters;
        const count = vehicles.filter((x) => routeIdToKey(x.routeId) === key).length;
        const idx = vehicles.filter((x) => routeIdToKey(x.routeId) === key).indexOf(v);
        busDistMetersRef.current[v.id] = total * (idx / Math.max(count, 1));
      }
    };

    const tick = (now: number) => {
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      const positions: { id: string; routeId: string; lon: number; lat: number; bearing: number }[] = [];
      vehicles.forEach((v) => {
        const key = routeIdToKey(v.routeId);
        const ip = key === 'P2P_EXPRESS' ? interp.P2P_EXPRESS : interp.BAITY_HILL;
        initBusDist(v);
        if (ip) {
          let d = busDistMetersRef.current[v.id] ?? 0;
          d += BUS_SPEED_MPS * dt;
          d = d % ip.totalLengthMeters;
          if (d < 0) d += ip.totalLengthMeters;
          busDistMetersRef.current[v.id] = d;
          const [lon, lat] = ip.pointAt(d);
          const bearing = ip.bearingAt(d);
          positions.push({ id: v.id, routeId: v.routeId, lon, lat, bearing });
        } else {
          positions.push({
            id: v.id,
            routeId: v.routeId,
            lon: v.lon,
            lat: v.lat,
            bearing: v.heading ?? 0,
          });
        }
      });
      const src = map.getSource(BUSES_SOURCE) as GeoJSONSource | undefined;
      if (src) {
        const geojson = busesToGeoJSON(positions);
        src.setData(geojson);
        if (isDev && positions.length > 0 && Math.random() < 0.01) {
          console.log('[Mapbox buses] setData', { features: geojson.features.length, sample: geojson.features[0] });
        }
      }
    };

    lastTickRef.current = performance.now();
    const id = setInterval(() => tick(performance.now()), TICK_MS);
    return () => clearInterval(id);
  }, [mapReady, vehicles]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (enable3D) {
      map.setPitch(PITCH_3D);
      try {
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.2 });
      } catch {
        /* ignore */
      }
      const layers = map.getStyle().layers;
      const firstSymbol = layers?.find((l) => l.type === 'symbol')?.id;
      try {
        map.addLayer(
          {
            id: 'buildings-3d',
            type: 'fill-extrusion',
            source: 'composite',
            'source-layer': 'building',
            minzoom: 14,
            paint: {
              'fill-extrusion-color': '#aaa',
              'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 16, ['get', 'height']],
              'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 14, 0, 16, ['get', 'min_height']],
              'fill-extrusion-opacity': 0.7,
            },
          } as mapboxgl.FillExtrusionLayerSpecification,
          firstSymbol
        );
      } catch {
        /* optional */
      }
    } else {
      map.setPitch(0);
      map.setTerrain(null);
      try {
        if (map.getLayer('buildings-3d')) map.removeLayer('buildings-3d');
      } catch {
        /* ignore */
      }
    }
  }, [mapReady, enable3D]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const onBus = (e: mapboxgl.MapMouseEvent) => {
      e.originalEvent.stopPropagation();
      const id = (e.features?.[0]?.properties as any)?.busId;
      if (id) {
        const bus = vehicles.find((v) => v.id === id);
        if (bus) onSelectBus(bus);
      }
    };
    const onStop = (e: mapboxgl.MapMouseEvent) => {
      e.originalEvent.stopPropagation();
      const id = (e.features?.[0]?.properties as any)?.id;
      if (id) {
        const stop = stops.find((s) => s.id === id);
        if (stop) onSelectStop(stop);
      }
    };
    map.on('click', BUSES_LAYER, onBus);
    map.on('click', P2P_EXPRESS_STOPS_LAYER, onStop);
    map.on('click', BAITY_HILL_STOPS_LAYER, onStop);
    map.getCanvas().style.cursor = 'default';
    map.on('mouseenter', BUSES_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', BUSES_LAYER, () => { map.getCanvas().style.cursor = 'default'; });
    map.on('mouseenter', P2P_EXPRESS_STOPS_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', P2P_EXPRESS_STOPS_LAYER, () => { map.getCanvas().style.cursor = 'default'; });
    map.on('mouseenter', BAITY_HILL_STOPS_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', BAITY_HILL_STOPS_LAYER, () => { map.getCanvas().style.cursor = 'default'; });
    return () => {
      map.off('click', BUSES_LAYER, onBus);
      map.off('click', P2P_EXPRESS_STOPS_LAYER, onStop);
      map.off('click', BAITY_HILL_STOPS_LAYER, onStop);
      map.off('mouseenter', BUSES_LAYER);
      map.off('mouseleave', BUSES_LAYER);
      map.off('mouseenter', P2P_EXPRESS_STOPS_LAYER);
      map.off('mouseleave', P2P_EXPRESS_STOPS_LAYER);
      map.off('mouseenter', BAITY_HILL_STOPS_LAYER);
      map.off('mouseleave', BAITY_HILL_STOPS_LAYER);
    };
  }, [mapReady, stops, vehicles, onSelectBus, onSelectStop]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const vis = (visible: boolean) => (visible ? 'visible' : 'none');
    [P2P_EXPRESS_LINE_LAYER, EXPRESS_ARROWS_LAYER, P2P_EXPRESS_STOPS_LAYER].forEach((id) => {
      try {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis(showExpress));
      } catch {
        /* ignore */
      }
    });
    [BAITY_HILL_LINE_LAYER, BAITY_ARROWS_LAYER, BAITY_HILL_STOPS_LAYER].forEach((id) => {
      try {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis(showBaity));
      } catch {
        /* ignore */
      }
    });
  }, [mapReady, showExpress, showBaity]);

  // Dev-only: keypress to toggle extreme arrow style (debug)
  useEffect(() => {
    if (!isDev || !mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'a' || !e.ctrlKey) return;
      e.preventDefault();
      const extreme = { 'symbol-spacing': 80, 'icon-size': 0.9 };
      const normal = { 'symbol-spacing': 140, 'icon-size': 0.6 };
      try {
        const cur = map.getLayoutProperty(EXPRESS_ARROWS_LAYER, 'icon-size');
        const next = (typeof cur === 'number' && cur > 0.7) ? normal : extreme;
        [EXPRESS_ARROWS_LAYER, BAITY_ARROWS_LAYER].forEach((id) => {
          if (map.getLayer(id)) {
            map.setLayoutProperty(id, 'symbol-spacing', next['symbol-spacing']);
            map.setLayoutProperty(id, 'icon-size', next['icon-size']);
          }
        });
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isDev, mapReady]);

  const recenter = useCallback(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;
    map.flyTo({
      center: [userLocation.lon, userLocation.lat],
      zoom: USER_ZOOM,
      pitch: enable3D ? PITCH_3D : 0,
      duration: 800,
    });
  }, [userLocation, enable3D]);

  if (!token) {
    return (
      <div className={`flex items-center justify-center bg-gray-200 ${className}`}>
        <p className="text-gray-600 text-sm">Map unavailable. Set VITE_MAPBOX_TOKEN in .env</p>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
      {isDev && mapReady && (
        <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-2 items-center bg-white/95 rounded-lg shadow border border-gray-200 p-2 text-sm">
          <span className="text-gray-500 font-mono text-xs">Buses: {vehicles.length}</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showExpress}
              onChange={(e) => setShowExpress(e.target.checked)}
            />
            <span style={{ color: ROUTE_COLORS.P2P_EXPRESS }}>P2P Express</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showBaity}
              onChange={(e) => setShowBaity(e.target.checked)}
            />
            <span style={{ color: ROUTE_COLORS.BAITY_HILL }}>Baity Hill</span>
          </label>
        </div>
      )}
      {userLocation && (
        <button
          type="button"
          onClick={recenter}
          className="absolute bottom-24 right-3 z-10 p-2.5 bg-white rounded-full shadow border border-gray-200 hover:bg-gray-50"
          aria-label="Recenter on my location"
        >
          <Navigation size={20} className="text-gray-700" />
        </button>
      )}
    </div>
  );
}

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
import { Navigation, Box, ExternalLink } from 'lucide-react';
import { API } from '../utils/api';

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
const BAITY_HILL_LINE_OVERLAP_LAYER = 'baity-hill-line-overlap-layer';
const EXPRESS_ARROWS_LAYER = 'express-arrows';
const BAITY_ARROWS_LAYER = 'baity-arrows';
const P2P_EXPRESS_STOPS_LAYER = 'p2p-express-stops-layer';
const BAITY_HILL_STOPS_LAYER = 'baity-hill-stops-layer';
const BUSES_SOURCE = 'buses-source';
const USER_SOURCE = 'user-source';
const JOURNEY_SOURCE = 'journey-source';
const JOURNEY_STOPS_SOURCE = 'journey-stops-source';
const DESTINATION_SOURCE = 'destination-source';
const BUSES_LAYER = 'buses-layer';
const USER_LAYER = 'user-layer';
const USER_HALO_LAYER = 'user-halo-layer';
const JOURNEY_CASING_LAYER = 'journey-casing-layer';
const JOURNEY_LAYER = 'journey-layer';
const JOURNEY_STOPS_LAYER = 'journey-stops-layer';
const DESTINATION_LAYER = 'destination-layer';

const ROUTE_COLORS = { P2P_EXPRESS: '#418FC5', BAITY_HILL: '#C33934' } as const;
const BUS_SPEED_MPS = 6;
const TICK_MS = 300;

/** Overlap tolerance in meters (2–5m for "same corridor"). */
const OVERLAP_TOLERANCE_METERS = 4;

type LineStringCoords = [number, number][];

type BaitySegmentFeature = {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: LineStringCoords };
  properties: { overlap: boolean };
};

function haversineDistanceMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function nearestDistanceToPolylineMeters(point: [number, number], line: LineStringCoords): number {
  let min = Infinity;
  for (let i = 0; i < line.length; i++) {
    const d = haversineDistanceMeters(point, line[i]);
    if (d < min) min = d;
  }
  return min;
}

function splitBaityByOverlap(
  baity: LineStringCoords,
  express: LineStringCoords | undefined,
  toleranceMeters: number
): { baseFeatures: BaitySegmentFeature[]; overlapFeatures: BaitySegmentFeature[] } {
  const baseFeatures: BaitySegmentFeature[] = [];
  const overlapFeatures: BaitySegmentFeature[] = [];

  if (baity.length < 2) return { baseFeatures, overlapFeatures };

  const push = (coords: LineStringCoords, overlap: boolean) => {
    if (coords.length < 2) return;
    const feature = { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: coords }, properties: { overlap } };
    if (overlap) overlapFeatures.push(feature);
    else baseFeatures.push(feature);
  };

  if (!express || express.length < 2) {
    push(baity, false);
    return { baseFeatures, overlapFeatures };
  }

  const isOverlap: boolean[] = baity.map((pt) => nearestDistanceToPolylineMeters(pt, express) <= toleranceMeters);

  let run: LineStringCoords = [baity[0]];
  let runOverlap = isOverlap[0] ?? false;

  for (let i = 1; i < baity.length; i++) {
    const overlap = isOverlap[i] ?? false;
    if (overlap === runOverlap) {
      run.push(baity[i]);
    } else {
      push(run, runOverlap);
      run = [baity[i - 1], baity[i]];
      runOverlap = overlap;
    }
  }
  push(run, runOverlap);

  return { baseFeatures, overlapFeatures };
}

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

/** Bus silhouette (side profile) for map marker. Color is fill. */
function createBusImageDataForColor(
  fill: string,
  fillDark: string,
  windowColor: string
): { width: number; height: number; data: Uint8Array | Uint8ClampedArray } {
  const w = 40;
  const h = 28;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = fillDark;
  ctx.fillRect(2, 10, 10, 10);
  ctx.fillStyle = fill;
  ctx.fillRect(10, 8, 20, 12);
  ctx.fillStyle = fillDark;
  ctx.fillRect(28, 10, 10, 10);
  ctx.fillStyle = windowColor;
  ctx.fillRect(13, 10, 4, 4);
  ctx.fillRect(19, 10, 4, 4);
  ctx.fillRect(25, 10, 4, 4);
  const id = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: id.data };
}

/** Express route: dark/navy bus icon (canvas fallback when SVG fails to load). */
function createBusExpressImageData() {
  return createBusImageDataForColor('#1a365d', '#1e3a5f', '#5a7fa3');
}

/** Baity Hill route: light/bright blue bus icon (canvas fallback). */
function createBusBaityImageData() {
  return createBusImageDataForColor('#38bdf8', '#0ea5e9', '#7dd3fc');
}

/** Tint a black-silhouette image to a single color; returns ImageData-like for addImage. */
function tintBusImage(
  img: HTMLImageElement | ImageBitmap,
  tintHex: string
): { width: number; height: number; data: Uint8ClampedArray } {
  const w = img.width;
  const h = img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, w, h);
  const data = id.data;
  const r = parseInt(tintHex.slice(1, 3), 16);
  const g = parseInt(tintHex.slice(3, 5), 16);
  const b = parseInt(tintHex.slice(5, 7), 16);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a > 0) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
  return { width: w, height: h, data };
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
  const features: GeoJSONFC['features'] = [];
  j.segments.forEach((seg) => {
    const geom = seg.type === 'walk' ? seg.geometry : seg.busSegmentGeometry;
    const coords: [number, number][] = geom?.coordinates?.length
      ? geom.coordinates
      : [[seg.fromCoords.lon, seg.fromCoords.lat], [seg.toCoords.lon, seg.toCoords.lat]];
    features.push({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: coords },
      properties: { segmentType: seg.type },
    });
  });
  return { type: 'FeatureCollection', features };
}

function journeyStopsToGeoJSON(j: Journey | null): GeoJSONFC {
  if (!j) return emptyFC();
  const features: Array<{ type: 'Feature'; geometry: { type: 'Point'; coordinates: number[] }; properties: Record<string, unknown> }> = [];
  j.segments.forEach((seg) => {
    if (seg.type === 'bus') {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [seg.fromCoords.lon, seg.fromCoords.lat] },
        properties: { stopType: 'board', name: seg.fromName },
      });
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [seg.toCoords.lon, seg.toCoords.lat] },
        properties: { stopType: 'alight', name: seg.toName },
      });
    }
  });
  return { type: 'FeatureCollection', features };
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
  onToggle3D?: () => void;
  onOpenRoutes?: () => void;
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
  onToggle3D,
  onOpenRoutes,
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
  const enabledBusRoutesRef = useRef({ showExpress: true, showBaity: true });

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

    const applyJourneyLayerStyles = () => {
      // Regression-proof: force the navigation route to stay BLACK with full opacity.
      try {
        if (map.getLayer(JOURNEY_CASING_LAYER)) {
          map.setPaintProperty(JOURNEY_CASING_LAYER, 'line-color', 'rgba(255,255,255,0.9)');
          map.setPaintProperty(JOURNEY_CASING_LAYER, 'line-opacity', 0.9);
          map.setPaintProperty(JOURNEY_CASING_LAYER, 'line-width', [
            'interpolate',
            ['linear'],
            ['zoom'],
            12, 4,
            16, 6,
            18, 7,
          ]);
        }
        if (map.getLayer(JOURNEY_LAYER)) {
          map.setPaintProperty(JOURNEY_LAYER, 'line-color', [
            'case',
            ['==', ['get', 'segmentType'], 'walk'],
            'rgba(78, 78, 78, 0.8)',
            '#000000',
          ]);
          map.setPaintProperty(JOURNEY_LAYER, 'line-opacity', 1);
          map.setPaintProperty(JOURNEY_LAYER, 'line-width', [
            'interpolate',
            ['linear'],
            ['zoom'],
            12, 4,
            16, 6,
            18, 7,
          ]);
        }
        // Ensure casing is below black, and black is above everything else.
        if (map.getLayer(JOURNEY_CASING_LAYER)) map.moveLayer(JOURNEY_CASING_LAYER);
        if (map.getLayer(JOURNEY_LAYER)) map.moveLayer(JOURNEY_LAYER);
        if (map.getLayer(JOURNEY_STOPS_LAYER)) map.moveLayer(JOURNEY_STOPS_LAYER);
        if (map.getLayer(DESTINATION_LAYER)) map.moveLayer(DESTINATION_LAYER);
      } catch {
        /* ignore */
      }
    };

    map.on('style.load', () => {
      applyJourneyLayerStyles();
    });

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
        paint: {
          'line-color': ROUTE_COLORS.P2P_EXPRESS,
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12, 3,
            16, 4,
            18, 5,
          ],
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: BAITY_HILL_LINE_LAYER,
        type: 'line',
        source: BAITY_HILL_LINE_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        filter: ['==', ['get', 'overlap'], false],
        paint: {
          'line-color': ROUTE_COLORS.BAITY_HILL,
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12, 3,
            16, 4,
            18, 5,
          ],
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: BAITY_HILL_LINE_OVERLAP_LAYER,
        type: 'line',
        source: BAITY_HILL_LINE_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        filter: ['==', ['get', 'overlap'], true],
        paint: {
          'line-color': ROUTE_COLORS.BAITY_HILL,
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12, 3,
            16, 4,
            18, 5,
          ],
          'line-opacity': 0.9,
          'line-translate': [6, 0],
          'line-translate-anchor': 'map',
        },
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
          const hasBusExpress = map.hasImage('bus-express');
          const hasBusBaity = map.hasImage('bus-baity');
          console.log('[Mapbox buses]', {
            [`map.getSource("${BUSES_SOURCE}")`]: hasBusesSource,
            [`map.getLayer("${BUSES_LAYER}")`]: hasBusesLayer,
            'map.hasImage("bus-express")': hasBusExpress,
            'map.hasImage("bus-baity")': hasBusBaity,
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
      map.addSource(JOURNEY_STOPS_SOURCE, { type: 'geojson', data: emptyFC() });
      map.addSource(DESTINATION_SOURCE, { type: 'geojson', data: emptyFC() });

      const BUS_ICON_EXPRESS_COLOR = '#1d4ed8';
      const BUS_ICON_BAITY_COLOR = '#e07c7c';
      type BusImageInput = HTMLImageElement | ImageBitmap | { width: number; height: number; data: Uint8Array | Uint8ClampedArray };
      const applyBusLayerFilter = () => {
        const { showExpress, showBaity } = enabledBusRoutesRef.current;
        const enabledRouteIds: string[] = [];
        if (showExpress) enabledRouteIds.push('p2p-express');
        if (showBaity) enabledRouteIds.push('baity-hill');
        try {
          if (!map.getLayer(BUSES_LAYER)) return;
          if (enabledRouteIds.length === 0) map.setFilter(BUSES_LAYER, ['==', ['get', 'routeId'], '']);
          else map.setFilter(BUSES_LAYER, ['in', ['get', 'routeId'], ['literal', enabledRouteIds]]);
        } catch {
          /* ignore */
        }
      };
      const addBusesSymbolLayer = (expressImg: BusImageInput, baityImg: BusImageInput) => {
        if (!map.hasImage('bus-express')) map.addImage('bus-express', expressImg as any, { sdf: false });
        if (!map.hasImage('bus-baity')) map.addImage('bus-baity', baityImg as any, { sdf: false });
        map.addLayer({
          id: BUSES_LAYER,
          type: 'symbol',
          source: BUSES_SOURCE,
          layout: {
            'icon-image': ['match', ['get', 'routeId'], 'p2p-express', 'bus-express', 'bus-baity'],
            'icon-size': 0.03,
            'icon-rotate': ['get', 'bearing'],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
          paint: {},
        });
        applyBusLayerFilter();
      };
      Promise.all([
        new Promise<BusImageInput | null>((resolve) => {
          map.loadImage('/icons/bus-express.png', (err, img) =>
            resolve(err ? null : (img as BusImageInput | null) ?? null)
          );
        }),
        new Promise<BusImageInput | null>((resolve) => {
          map.loadImage('/icons/bus-baity.png', (err, img) =>
            resolve(err ? null : (img as BusImageInput | null) ?? null)
          );
        }),
      ])
        .then(([expressImg, baityImg]) => {
          if (expressImg && baityImg) {
            addBusesSymbolLayer(expressImg, baityImg);
            return;
          }
          return Promise.all([
            new Promise<BusImageInput>((resolve, reject) => {
              map.loadImage('/icons/bus-express.svg', (err, img) => (err ? reject(err) : resolve((img ?? null) as BusImageInput)));
            }),
            new Promise<BusImageInput>((resolve, reject) => {
              map.loadImage('/icons/bus-baity.svg', (err, img) => (err ? reject(err) : resolve((img ?? null) as BusImageInput)));
            }),
          ]).then(([e, b]) => addBusesSymbolLayer(e, b));
        })
        .catch(() => {
          try {
            addBusesSymbolLayer(createBusExpressImageData(), createBusBaityImageData());
          } catch (e) {
            if (isDev) console.warn('[Mapbox buses] canvas fallback failed', e);
            map.addLayer({
              id: BUSES_LAYER,
              type: 'circle',
              source: BUSES_SOURCE,
              paint: {
                'circle-radius': 10,
                'circle-color': ['case', ['==', ['get', 'routeId'], 'p2p-express'], BUS_ICON_EXPRESS_COLOR, BUS_ICON_BAITY_COLOR],
                'circle-stroke-width': 2,
                'circle-stroke-color': '#fff',
              },
            });
            applyBusLayerFilter();
          }
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
      // Journey casing (white outline) under black route for contrast
      map.addLayer({
        id: JOURNEY_CASING_LAYER,
        type: 'line',
        source: JOURNEY_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': 'rgba(255,255,255,0.9)',
          'line-opacity': 0.9,
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 6,
            13, 8,
            16, 10,
            19, 13,
          ],
        },
      });
      map.addLayer({
        id: JOURNEY_LAYER,
        type: 'line',
        source: JOURNEY_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'segmentType'], 'walk'],
            'rgba(78, 78, 78, 0.8)',
            '#000000',
          ],
          'line-opacity': 1,
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 4,
            13, 6,
            16, 8,
            19, 11,
          ],
          'line-dasharray': ['case', ['==', ['get', 'segmentType'], 'walk'], ['literal', [2, 2]], ['literal', []]],
        },
      });
      map.addLayer({
        id: JOURNEY_STOPS_LAYER,
        type: 'circle',
        source: JOURNEY_STOPS_SOURCE,
        paint: {
          'circle-radius': ['case', ['==', ['get', 'stopType'], 'board'], 8, 8],
          'circle-color': ['case', ['==', ['get', 'stopType'], 'board'], '#418FC5', '#C33934'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });
      map.addLayer({
        id: DESTINATION_LAYER,
        type: 'circle',
        source: DESTINATION_SOURCE,
        paint: {
          'circle-radius': 8,
          'circle-color': '#EF4444',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });

      applyJourneyLayerStyles();
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
    const jStops = map.getSource(JOURNEY_STOPS_SOURCE) as GeoJSONSource | undefined;
    const d = map.getSource(DESTINATION_SOURCE) as GeoJSONSource | undefined;
    if (expressStops) expressStops.setData(routeStopsToGeoJSON(P2P_EXPRESS_STOPS, selectedStopId));
    if (baityStops) baityStops.setData(routeStopsToGeoJSON(BAITY_HILL_STOPS, selectedStopId));
    if (u) u.setData(userToGeoJSON(userLocation));
    if (j) j.setData(journeyToGeoJSON(activeJourney));
    if (jStops) jStops.setData(journeyStopsToGeoJSON(activeJourney));
    if (d) {
      if (activeJourney) {
        const dest = activeJourney.destination;
        d.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates: [dest.lon, dest.lat] },
              properties: {},
            },
          ],
        });
      } else {
        d.setData(emptyFC());
      }
    }
    if (activeJourney) {
      try {
        // Re-apply styles in case of style/theme changes
        if (map.getLayer(JOURNEY_CASING_LAYER)) {
          map.setPaintProperty(JOURNEY_CASING_LAYER, 'line-color', 'rgba(255,255,255,0.9)');
          map.setPaintProperty(JOURNEY_CASING_LAYER, 'line-opacity', 0.9);
        }
        if (map.getLayer(JOURNEY_LAYER)) {
          map.setPaintProperty(JOURNEY_LAYER, 'line-color', [
            'case',
            ['==', ['get', 'segmentType'], 'walk'],
            'rgba(78, 78, 78, 0.8)',
            '#000000',
          ]);
          map.setPaintProperty(JOURNEY_LAYER, 'line-opacity', 1);
        }
        if (map.getLayer(JOURNEY_CASING_LAYER)) map.moveLayer(JOURNEY_CASING_LAYER);
        if (map.getLayer(JOURNEY_LAYER)) map.moveLayer(JOURNEY_LAYER);
        if (map.getLayer(JOURNEY_STOPS_LAYER)) map.moveLayer(JOURNEY_STOPS_LAYER);
        if (map.getLayer(DESTINATION_LAYER)) map.moveLayer(DESTINATION_LAYER);
      } catch {
        /* ignore if layers not ready */
      }
    }
  }, [mapReady, selectedStopId, userLocation, activeJourney]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !activeJourney) return;
    map.flyTo({
      center: [activeJourney.destination.lon, activeJourney.destination.lat],
      zoom: 15,
      duration: 1200,
      essential: true,
    });
  }, [mapReady, activeJourney]);

  // Fetch route polylines from server proxy (cached); store geometry for bus interpolation
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    const updateRouteLineSources = () => {
      const expressCoords = routeGeomsRef.current.P2P_EXPRESS;
      const baityCoords = routeGeomsRef.current.BAITY_HILL;
      const expressSrc = map.getSource(P2P_EXPRESS_LINE_SOURCE) as GeoJSONSource | undefined;
      const baitySrc = map.getSource(BAITY_HILL_LINE_SOURCE) as GeoJSONSource | undefined;

      if (expressSrc && expressCoords && expressCoords.length > 1) {
        expressSrc.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: expressCoords },
              properties: {},
            },
          ],
        });
      }

      if (baitySrc && baityCoords && baityCoords.length > 1) {
        const { baseFeatures, overlapFeatures } = splitBaityByOverlap(
          baityCoords,
          expressCoords,
          OVERLAP_TOLERANCE_METERS
        );
        const features = [...baseFeatures, ...overlapFeatures];
        baitySrc.setData({ type: 'FeatureCollection', features });
      }
    };

    (['P2P_EXPRESS', 'BAITY_HILL'] as const).forEach((routeId) => {
      fetch(`${API}/api/mapbox/route?routeId=${routeId}`)
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
          updateRouteLineSources();
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

  enabledBusRoutesRef.current = { showExpress, showBaity };

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
    [BAITY_HILL_LINE_LAYER, BAITY_HILL_LINE_OVERLAP_LAYER, BAITY_ARROWS_LAYER, BAITY_HILL_STOPS_LAYER].forEach((id) => {
      try {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis(showBaity));
      } catch {
        /* ignore */
      }
    });
    const enabledRouteIds: string[] = [];
    if (showExpress) enabledRouteIds.push('p2p-express');
    if (showBaity) enabledRouteIds.push('baity-hill');
    try {
      if (map.getLayer(BUSES_LAYER)) {
        if (enabledRouteIds.length === 0) {
          map.setFilter(BUSES_LAYER, ['==', ['get', 'routeId'], '']);
        } else {
          map.setFilter(BUSES_LAYER, ['in', ['get', 'routeId'], ['literal', enabledRouteIds]]);
        }
      }
    } catch {
      /* ignore */
    }
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
      {mapReady && (
        <div
          className="absolute top-2 left-2 z-[500] flex flex-col gap-2 w-[calc(100%-1rem)] max-w-sm"
          style={{ fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif" }}
          role="group"
          aria-label="Map controls"
        >
          <div
            className="flex flex-wrap items-center gap-3 bg-white/95 rounded-xl shadow-md border border-gray-200/80 p-3"
            role="group"
            aria-label="Route visibility"
          >
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold tracking-tight text-[#418FC5]">Buses</span>
              <span className="inline-flex min-w-[28px] items-center justify-center rounded-lg bg-[#418FC5]/15 px-2 py-0.5 text-sm font-bold text-[#418FC5]">
                {vehicles.length}
              </span>
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded focus-within:ring-2 focus-within:ring-[#418FC5]/40 focus-within:ring-offset-1">
              <input
                type="checkbox"
                checked={showExpress}
                onChange={(e) => setShowExpress(e.target.checked)}
                className="h-4 w-4 shrink-0 cursor-pointer rounded-[6px] border-2 border-gray-300 bg-white shadow-sm transition-all duration-200 appearance-none hover:border-gray-400 focus:ring-0 focus:ring-offset-0 checked:border-[#418FC5] checked:bg-[#418FC5] checked:bg-[length:12px_12px] checked:bg-center checked:bg-no-repeat"
                style={{
                  backgroundImage: showExpress
                    ? "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12l5 5L20 7'/%3E%3C/svg%3E\")"
                    : undefined,
                }}
                aria-label="Toggle P2P Express route"
              />
              <span className="text-sm font-medium" style={{ color: ROUTE_COLORS.P2P_EXPRESS }}>P2P Express</span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded focus-within:ring-2 focus-within:ring-[#C33934]/40 focus-within:ring-offset-1">
              <input
                type="checkbox"
                checked={showBaity}
                onChange={(e) => setShowBaity(e.target.checked)}
                className="h-4 w-4 shrink-0 cursor-pointer rounded-[6px] border-2 border-gray-300 bg-white shadow-sm transition-all duration-200 appearance-none hover:border-gray-400 focus:ring-0 focus:ring-offset-0 checked:border-[#C33934] checked:bg-[#C33934] checked:bg-[length:12px_12px] checked:bg-center checked:bg-no-repeat"
                style={{
                  backgroundImage: showBaity
                    ? "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12l5 5L20 7'/%3E%3C/svg%3E\")"
                    : undefined,
                }}
                aria-label="Toggle Baity Hill route"
              />
              <span className="text-sm font-medium" style={{ color: ROUTE_COLORS.BAITY_HILL }}>Baity Hill</span>
            </label>
          </div>

          {/* When navigation active: compact icon-only 3D + Routes under Buses */}
          {activeJourney && (onToggle3D != null || onOpenRoutes != null) && (
            <div className="flex flex-col gap-2">
              {onToggle3D != null && (
                <button
                  type="button"
                  onClick={onToggle3D}
                  className="w-10 h-10 rounded-full bg-white/95 backdrop-blur-sm shadow-md border border-gray-200/80 flex items-center justify-center text-gray-700 hover:bg-white active:scale-[0.98] transition-all self-start"
                  aria-label="Toggle 3D view"
                  aria-pressed={enable3D}
                >
                  <Box size={20} strokeWidth={2} />
                </button>
              )}
              {onOpenRoutes != null && (
                <button
                  type="button"
                  onClick={onOpenRoutes}
                  className="w-10 h-10 rounded-full bg-white/95 backdrop-blur-sm shadow-md border border-gray-200/80 flex items-center justify-center text-gray-700 hover:bg-white active:scale-[0.98] transition-all self-start"
                  aria-label="View P2P routes PDF"
                >
                  <ExternalLink size={20} />
                </button>
              )}
            </div>
          )}
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

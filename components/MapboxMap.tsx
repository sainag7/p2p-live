/**
 * Mapbox GL JS map (student map view). Replaces Leaflet.
 * Single init on mount; updates via source.setData. No globe mode.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Map as MapboxMapType, GeoJSONSource } from 'mapbox-gl';
import { Stop, Vehicle, Coordinate, Journey } from '../types';
import { Navigation } from 'lucide-react';

type GeoJSONFC = { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; geometry: { type: 'Point'; coordinates: number[] } | { type: 'LineString'; coordinates: [number, number][] }; properties: Record<string, unknown> }> };

const CHAPEL_HILL: [number, number] = [-79.05, 35.9132];
const DEFAULT_ZOOM = 13;
const USER_ZOOM = 16;
const PITCH_3D = 60;

const STOPS_SOURCE = 'stops-source';
const BUSES_SOURCE = 'buses-source';
const USER_SOURCE = 'user-source';
const JOURNEY_SOURCE = 'journey-source';
const STOPS_LAYER = 'stops-layer';
const BUSES_LAYER = 'buses-layer';
const USER_LAYER = 'user-layer';
const USER_HALO_LAYER = 'user-halo-layer';
const JOURNEY_LAYER = 'journey-layer';

function emptyFC(): GeoJSONFC {
  return { type: 'FeatureCollection', features: [] };
}

function stopsToGeoJSON(stops: Stop[], selectedId: string | null): GeoJSONFC {
  return {
    type: 'FeatureCollection',
    features: stops.map((s) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
      properties: { id: s.id, name: s.name, selected: s.id === selectedId },
    })),
  };
}

function vehiclesToGeoJSON(vehicles: Vehicle[]): GeoJSONFC {
  return {
    type: 'FeatureCollection',
    features: vehicles.map((v) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [v.lon, v.lat] },
      properties: { busId: v.id, routeId: v.routeId, heading: v.heading ?? 0 },
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

  const token = typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_MAPBOX_TOKEN;

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

      map.addSource(STOPS_SOURCE, { type: 'geojson', data: emptyFC() });
      map.addSource(BUSES_SOURCE, { type: 'geojson', data: emptyFC() });
      map.addSource(USER_SOURCE, { type: 'geojson', data: emptyFC() });
      map.addSource(JOURNEY_SOURCE, { type: 'geojson', data: emptyFC() });

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
        id: STOPS_LAYER,
        type: 'circle',
        source: STOPS_SOURCE,
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 9, 7],
          'circle-color': ['case', ['get', 'selected'], '#418FC5', '#fff'],
          'circle-stroke-width': ['case', ['get', 'selected'], 3, 2],
          'circle-stroke-color': ['case', ['get', 'selected'], '#fff', '#64748b'],
        },
      });
      map.addLayer({
        id: BUSES_LAYER,
        type: 'circle',
        source: BUSES_SOURCE,
        paint: {
          'circle-radius': 14,
          'circle-color': ['case', ['==', ['get', 'routeId'], 'p2p-express'], '#418FC5', '#C33934'],
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
    const s = map.getSource(STOPS_SOURCE) as GeoJSONSource | undefined;
    const b = map.getSource(BUSES_SOURCE) as GeoJSONSource | undefined;
    const u = map.getSource(USER_SOURCE) as GeoJSONSource | undefined;
    const j = map.getSource(JOURNEY_SOURCE) as GeoJSONSource | undefined;
    if (s) s.setData(stopsToGeoJSON(stops, selectedStopId));
    if (b) b.setData(vehiclesToGeoJSON(vehicles));
    if (u) u.setData(userToGeoJSON(userLocation));
    if (j) j.setData(journeyToGeoJSON(activeJourney));
  }, [mapReady, stops, vehicles, userLocation, selectedStopId, activeJourney]);

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
    map.on('click', STOPS_LAYER, onStop);
    map.getCanvas().style.cursor = 'default';
    map.on('mouseenter', BUSES_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', BUSES_LAYER, () => { map.getCanvas().style.cursor = 'default'; });
    map.on('mouseenter', STOPS_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', STOPS_LAYER, () => { map.getCanvas().style.cursor = 'default'; });
    return () => {
      map.off('click', BUSES_LAYER, onBus);
      map.off('click', STOPS_LAYER, onStop);
      map.off('mouseenter', BUSES_LAYER);
      map.off('mouseleave', BUSES_LAYER);
      map.off('mouseenter', STOPS_LAYER);
      map.off('mouseleave', STOPS_LAYER);
    };
  }, [mapReady, stops, vehicles, onSelectBus, onSelectStop]);

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

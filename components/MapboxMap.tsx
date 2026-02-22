/**
 * Mapbox GL JS map (student map view). Replaces Leaflet.
 * Uses GeoJSON sources for performance; no per-render DOM markers.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Map as MapboxMapType, GeoJSONSource } from 'mapbox-gl';
import { Stop, Vehicle, Coordinate, Journey } from '../types';
import { Navigation } from 'lucide-react';
import { journeyToMapSources } from '../utils/journeyToMapSources';

interface GeoJSONFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: number[] } | { type: 'LineString'; coordinates: [number, number][] };
  properties: Record<string, unknown>;
  id?: string;
}
type GeoJSONFC = { type: 'FeatureCollection'; features: GeoJSONFeature[] };

const CHAPEL_HILL_CENTER: [number, number] = [-79.05, 35.9132];
const DEFAULT_ZOOM = 13;
const USER_ZOOM = 16;
const USER_PITCH = 60;

const STOPS_SOURCE = 'stops-source';
const BUSES_SOURCE = 'buses-source';
const JOURNEY_WALK_SOURCE = 'journey-walk-source';
const JOURNEY_BUS_SOURCE = 'journey-bus-source';
const JOURNEY_DESTINATION_SOURCE = 'journey-destination-source';
const USER_SOURCE = 'user-source';
const STOPS_LAYER = 'stops-layer';
const BUSES_LAYER = 'buses-layer';
const JOURNEY_WALK_LAYER = 'journey-walk-layer';
const JOURNEY_BUS_LAYER = 'journey-bus-layer';
const JOURNEY_DESTINATION_LAYER = 'journey-destination-layer';
const USER_LAYER = 'user-layer';
const USER_HALO_LAYER = 'user-halo-layer';
const BUS_ICON_ID = 'bus-icon';
const PIN_ICON_ID = 'pin-icon';
const PLACEMENT_SOURCE = 'placement-source';
const PLACEMENT_LAYER = 'placement-layer';

const BUS_ICON_URL = '/icons/bus.svg';
const PIN_ICON_URL = '/icons/pin.svg';

function emptyFeatureCollection(): GeoJSONFC {
  return { type: 'FeatureCollection', features: [] };
}

function stopsToGeoJSON(stops: Stop[], selectedStopId: string | null): GeoJSONFC {
  return {
    type: 'FeatureCollection',
    features: stops.map((s) => ({
      type: 'Feature' as const,
      id: s.id,
      geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
      properties: { id: s.id, name: s.name, selected: s.id === selectedStopId },
    })),
  };
}

function vehiclesToGeoJSON(vehicles: Vehicle[]): GeoJSONFC {
  return {
    type: 'FeatureCollection',
    features: vehicles.map((v) => ({
      type: 'Feature' as const,
      id: v.id,
      geometry: { type: 'Point' as const, coordinates: [v.lon, v.lat] },
      properties: {
        busId: v.id,
        routeName: v.routeName,
        routeId: v.routeId,
        heading: v.heading ?? 0,
      },
    })),
  };
}

function userToGeoJSON(loc: Coordinate | null): GeoJSONFC {
  if (!loc) return emptyFeatureCollection();
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [loc.lon, loc.lat] },
        properties: {},
      },
    ],
  };
}

export interface MapboxMapProps {
  stops: Stop[];
  vehicles: Vehicle[];
  userLocation: Coordinate | null;
  /** When true, fly to user once (geolocation succeeded). */
  userLocationResolved?: boolean;
  selectedStopId: string | null;
  selectedBusId: string | null;
  activeJourney: Journey | null;
  onSelectBus: (bus: Vehicle) => void;
  onSelectStop: (stop: Stop) => void;
  onRecenter?: () => void;
  /** Optional: enable 3D (pitch + terrain + buildings). */
  enable3D?: boolean;
  /** Dev: when set, map click (no feature) reports lng, lat for stop placement. */
  onMapClick?: (lng: number, lat: number) => void;
  /** Dev: temporary placement markers (lng, lat) for Stop Placement Mode. */
  placementMarkers?: { lng: number; lat: number }[];
  className?: string;
}

export const MapboxMap: React.FC<MapboxMapProps> = ({
  stops,
  vehicles,
  userLocation,
  userLocationResolved = false,
  selectedStopId,
  selectedBusId,
  activeJourney,
  onSelectBus,
  onSelectStop,
  onRecenter,
  enable3D = true,
  onMapClick,
  placementMarkers,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMapType | null>(null);
  const hasFlownToUserRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  const token = typeof import.meta !== 'undefined' && import.meta.env?.VITE_MAPBOX_TOKEN;

  // Create map once on mount
  useEffect(() => {
    if (!containerRef.current || !token) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      accessToken: token,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: CHAPEL_HILL_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 0,
      bearing: 0,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');

    map.on('load', () => {
      // 3D terrain (no globe)
      try {
        map.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        });
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.2 });
      } catch {
        // style or terrain not supported
      }

      // Optional sky (subtle; no globe)
      try {
        map.addLayer({
          id: 'sky',
          type: 'sky',
          paint: {
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0.0, 0.0],
            'sky-atmosphere-sun-intensity': 5,
          },
        } as mapboxgl.SkyLayerSpecification);
      } catch {
        // ignore
      }

      // 3D buildings (insert before first symbol layer so labels stay on top)
      const layers = map.getStyle().layers;
      const firstSymbolId = layers?.find((l) => l.type === 'symbol')?.id;
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
          firstSymbolId
        );
      } catch {
        // composite/building not available
      }

      // Our overlay sources (empty initially)
      map.addSource(STOPS_SOURCE, { type: 'geojson', data: emptyFeatureCollection() });
      map.addSource(BUSES_SOURCE, { type: 'geojson', data: emptyFeatureCollection() });
      map.addSource(JOURNEY_WALK_SOURCE, { type: 'geojson', data: emptyFeatureCollection() });
      map.addSource(JOURNEY_BUS_SOURCE, { type: 'geojson', data: emptyFeatureCollection() });
      map.addSource(JOURNEY_DESTINATION_SOURCE, { type: 'geojson', data: emptyFeatureCollection() });
      map.addSource(USER_SOURCE, { type: 'geojson', data: emptyFeatureCollection() });
      map.addSource(PLACEMENT_SOURCE, { type: 'geojson', data: emptyFeatureCollection() });

      map.addLayer({
        id: USER_HALO_LAYER,
        type: 'circle',
        source: USER_SOURCE,
        paint: {
          'circle-radius': 10,
          'circle-color': 'rgba(66, 133, 244, 0.2)',
          'circle-stroke-width': 0,
        },
      });
      map.addLayer({
        id: USER_LAYER,
        type: 'circle',
        source: USER_SOURCE,
        paint: {
          'circle-radius': 5,
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
      // Bus icon: load then add symbol layer (with optional circle behind for visibility)
      const addBusLayer = () => {
        if (map.hasImage(BUS_ICON_ID)) {
          map.addLayer({
            id: 'buses-circle-layer',
            type: 'circle',
            source: BUSES_SOURCE,
            paint: {
              'circle-radius': 10,
              'circle-color': ['case', ['==', ['get', 'routeId'], 'p2p-express'], '#418FC5', '#C33934'],
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#fff',
            },
          });
          map.addLayer({
            id: BUSES_LAYER,
            type: 'symbol',
            source: BUSES_SOURCE,
            layout: {
              'icon-image': BUS_ICON_ID,
              'icon-size': 0.55,
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
              'icon-rotate': ['get', 'heading'],
              'icon-rotation-alignment': 'map',
            },
            paint: {
              'icon-color': '#fff',
            },
          });
          return;
        }
        const url = typeof window !== 'undefined' ? `${window.location.origin}${BUS_ICON_URL}` : BUS_ICON_URL;
        map.loadImage(url, (err, img) => {
          if (err || !img) {
            // Fallback: circle-only buses
            map.addLayer({
              id: 'buses-circle-layer',
              type: 'circle',
              source: BUSES_SOURCE,
              paint: {
                'circle-radius': 10,
                'circle-color': ['case', ['==', ['get', 'routeId'], 'p2p-express'], '#418FC5', '#C33934'],
                'circle-stroke-width': 1.5,
                'circle-stroke-color': '#fff',
              },
            });
            map.addLayer({
              id: BUSES_LAYER,
              type: 'circle',
              source: BUSES_SOURCE,
              paint: {
                'circle-radius': 4,
                'circle-color': '#fff',
              },
            });
            return;
          }
          map.addImage(BUS_ICON_ID, img, { sdf: false });
          map.addLayer({
            id: 'buses-circle-layer',
            type: 'circle',
            source: BUSES_SOURCE,
            paint: {
              'circle-radius': 10,
              'circle-color': ['case', ['==', ['get', 'routeId'], 'p2p-express'], '#418FC5', '#C33934'],
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#fff',
            },
          });
          map.addLayer({
            id: BUSES_LAYER,
            type: 'symbol',
            source: BUSES_SOURCE,
            layout: {
              'icon-image': BUS_ICON_ID,
              'icon-size': 0.55,
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
              'icon-rotate': ['get', 'heading'],
              'icon-rotation-alignment': 'map',
            },
            paint: {
              'icon-color': '#fff',
            },
          });
        });
      };
      addBusLayer();

      // Journey: walk (dashed), bus (solid), destination (pin)
      map.addLayer({
        id: JOURNEY_WALK_LAYER,
        type: 'line',
        source: JOURNEY_WALK_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#418FC5',
          'line-width': 4,
          'line-opacity': 0.85,
          'line-dasharray': [1.2, 1.2],
        },
      });
      map.addLayer({
        id: JOURNEY_BUS_LAYER,
        type: 'line',
        source: JOURNEY_BUS_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['case', ['==', ['get', 'routeId'], 'baity-hill'], '#C33934', '#418FC5'],
          'line-width': 5,
          'line-opacity': 0.9,
        },
      });

      const addDestinationLayer = () => {
        if (map.hasImage(PIN_ICON_ID)) {
          map.addLayer({
            id: JOURNEY_DESTINATION_LAYER,
            type: 'symbol',
            source: JOURNEY_DESTINATION_SOURCE,
            layout: {
              'icon-image': PIN_ICON_ID,
              'icon-size': 0.8,
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
              'icon-anchor': 'bottom',
            },
            paint: {
              'icon-color': '#C33934',
            },
          });
          return;
        }
        const pinUrl = typeof window !== 'undefined' ? `${window.location.origin}${PIN_ICON_URL}` : PIN_ICON_URL;
        map.loadImage(pinUrl, (err, img) => {
          if (err || !img) {
            map.addLayer({
              id: JOURNEY_DESTINATION_LAYER,
              type: 'circle',
              source: JOURNEY_DESTINATION_SOURCE,
              paint: {
                'circle-radius': 10,
                'circle-color': '#C33934',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#fff',
              },
            });
            return;
          }
          map.addImage(PIN_ICON_ID, img, { sdf: false });
          map.addLayer({
            id: JOURNEY_DESTINATION_LAYER,
            type: 'symbol',
            source: JOURNEY_DESTINATION_SOURCE,
            layout: {
              'icon-image': PIN_ICON_ID,
              'icon-size': 0.8,
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
              'icon-anchor': 'bottom',
            },
            paint: {
              'icon-color': '#C33934',
            },
          });
        });
      };
      addDestinationLayer();

      map.addLayer({
        id: PLACEMENT_LAYER,
        type: 'circle',
        source: PLACEMENT_SOURCE,
        paint: {
          'circle-radius': 8,
          'circle-color': '#f59e0b',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });

      setMapReady(true);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  // Fly to user once when geolocation resolves
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !userLocationResolved || !userLocation || hasFlownToUserRef.current)
      return;
    hasFlownToUserRef.current = true;
    map.flyTo({
      center: [userLocation.lon, userLocation.lat],
      zoom: USER_ZOOM,
      pitch: enable3D ? USER_PITCH : 0,
      duration: 1500,
      essential: true,
    });
  }, [userLocationResolved, userLocation, enable3D]);

  // Update sources when data changes (no re-init)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const stopsSource = map.getSource(STOPS_SOURCE) as GeoJSONSource | undefined;
    const busesSource = map.getSource(BUSES_SOURCE) as GeoJSONSource | undefined;
    const journeyWalkSource = map.getSource(JOURNEY_WALK_SOURCE) as GeoJSONSource | undefined;
    const journeyBusSource = map.getSource(JOURNEY_BUS_SOURCE) as GeoJSONSource | undefined;
    const journeyDestSource = map.getSource(JOURNEY_DESTINATION_SOURCE) as GeoJSONSource | undefined;
    const userSource = map.getSource(USER_SOURCE) as GeoJSONSource | undefined;

    if (stopsSource) stopsSource.setData(stopsToGeoJSON(stops, selectedStopId));
    if (busesSource) busesSource.setData(vehiclesToGeoJSON(vehicles));
    const journeySources = journeyToMapSources(activeJourney);
    if (journeyWalkSource) journeyWalkSource.setData(journeySources.walkGeoJson);
    if (journeyBusSource) journeyBusSource.setData(journeySources.busGeoJson);
    if (journeyDestSource) {
      journeyDestSource.setData(
        journeySources.destinationGeoJson ?? emptyFeatureCollection()
      );
    }
    if (userSource) userSource.setData(userToGeoJSON(userLocation));

    const placementSource = map.getSource(PLACEMENT_SOURCE) as GeoJSONSource | undefined;
    if (placementSource && placementMarkers?.length) {
      placementSource.setData({
        type: 'FeatureCollection',
        features: placementMarkers.map((m) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
          properties: {},
        })),
      });
    } else if (placementSource) {
      placementSource.setData(emptyFeatureCollection());
    }
  }, [stops, vehicles, userLocation, selectedStopId, activeJourney, mapReady, placementMarkers]);

  // 3D toggle: pitch and terrain
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (enable3D) {
      map.setPitch(USER_PITCH);
      try {
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.2 });
      } catch {
        //
      }
    } else {
      map.setPitch(0);
      map.setTerrain(null);
    }
  }, [enable3D]);

  // Click handlers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const onBusClick = (e: mapboxgl.MapMouseEvent) => {
      e.originalEvent.stopPropagation();
      const f = e.features?.[0];
      const busId = f?.properties?.busId as string | undefined;
      if (!busId) return;
      const bus = vehicles.find((v) => v.id === busId);
      if (bus) onSelectBus(bus);
    };

    const onStopClick = (e: mapboxgl.MapMouseEvent) => {
      e.originalEvent.stopPropagation();
      const f = e.features?.[0];
      const id = f?.properties?.id as string | undefined;
      if (!id) return;
      const stop = stops.find((s) => s.id === id);
      if (stop) onSelectStop(stop);
    };

    map.on('click', BUSES_LAYER, onBusClick);
    map.on('click', STOPS_LAYER, onStopClick);

    const handleMapClick = (e: mapboxgl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [BUSES_LAYER, STOPS_LAYER, 'buses-circle-layer', PLACEMENT_LAYER],
      });
      if (features.length === 0 && onMapClick) onMapClick(e.lngLat.lng, e.lngLat.lat);
    };
    map.on('click', handleMapClick);

    map.getCanvas().style.cursor = 'default';
    map.on('mouseenter', BUSES_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', BUSES_LAYER, () => { map.getCanvas().style.cursor = 'default'; });
    map.on('mouseenter', STOPS_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', STOPS_LAYER, () => { map.getCanvas().style.cursor = 'default'; });

    return () => {
      map.off('click', BUSES_LAYER, onBusClick);
      map.off('click', STOPS_LAYER, onStopClick);
      map.off('click', handleMapClick);
      map.off('mouseenter', BUSES_LAYER);
      map.off('mouseleave', BUSES_LAYER);
      map.off('mouseenter', STOPS_LAYER);
      map.off('mouseleave', STOPS_LAYER);
    };
  }, [mapReady, stops, vehicles, onSelectBus, onSelectStop, onMapClick]);

  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;
    map.flyTo({
      center: [userLocation.lon, userLocation.lat],
      zoom: USER_ZOOM,
      pitch: enable3D ? USER_PITCH : 0,
      duration: 800,
    });
  }, [userLocation, enable3D]);

  if (!token) {
    return (
      <div className={`flex items-center justify-center bg-gray-200 ${className}`}>
        <p className="text-gray-600 text-sm">Map unavailable. Set VITE_MAPBOX_TOKEN in .env.</p>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
      {userLocation && (
        <button
          type="button"
          onClick={onRecenter ?? handleRecenter}
          className="absolute bottom-24 right-3 z-10 p-2.5 bg-white rounded-full shadow-md border border-gray-200 hover:bg-gray-50"
          aria-label="Recenter on my location"
        >
          <Navigation size={20} className="text-gray-700" />
        </button>
      )}
    </div>
  );
}

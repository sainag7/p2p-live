/**
 * Mini map showing driver's current location. Uses Mapbox GL JS (same as student map).
 */

import React, { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Map as MapboxMapType } from 'mapbox-gl';

const DEFAULT_CENTER: [number, number] = [-79.0478, 35.9105]; // UNC Student Union [lng, lat]
const DRIVER_SOURCE = 'driver-location-source';
const DRIVER_LAYER = 'driver-location-layer';

const token = typeof import.meta !== 'undefined' && import.meta.env?.VITE_MAPBOX_TOKEN;

interface DriverLocationMapProps {
  className?: string;
  height?: number;
}

export function DriverLocationMap({ className = '', height = 240 }: DriverLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMapType | null>(null);
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setPosition({ lat: DEFAULT_CENTER[1], lon: DEFAULT_CENTER[0] });
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lon: p.coords.longitude });
        setLoading(false);
      },
      () => {
        setPosition({ lat: DEFAULT_CENTER[1], lon: DEFAULT_CENTER[0] });
        setLoading(false);
      },
      { enableHighAccuracy: true }
    );
  }, []);

  useEffect(() => {
    if (!containerRef.current || !token || position === null) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      accessToken: token,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [position.lon, position.lat],
      zoom: 15,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('load', () => {
      map.addSource(DRIVER_SOURCE, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [position.lon, position.lat] },
              properties: {},
            },
          ],
        },
      });
      map.addLayer({
        id: DRIVER_LAYER,
        type: 'circle',
        source: DRIVER_SOURCE,
        paint: {
          'circle-radius': 14,
          'circle-color': '#418FC5',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#fff',
        },
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [token, position?.lat, position?.lon]);

  if (!token) {
    return (
      <div
        className={`rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-gray-100 flex items-center justify-center text-gray-500 text-sm ${className}`}
        style={{ height: `${height}px` }}
      >
        Set VITE_MAPBOX_TOKEN for map
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={`rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-gray-100 flex items-center justify-center text-gray-500 text-sm ${className}`}
        style={{ height: `${height}px` }}
      >
        Getting location…
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-gray-100 ${className}`}
      style={{ height: `${height}px` }}
    >
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

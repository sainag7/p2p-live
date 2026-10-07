import React, { Component, Suspense, lazy } from 'react';
import type { MapCamera, MapboxMapProps } from './MapboxMap';

let mapModule: Promise<typeof import('./MapboxMap')> | null = null;
function loadMap() {
  if (!mapModule) mapModule = import('./MapboxMap').catch(error => { mapModule = null; throw error; });
  return mapModule.then(module => ({ default: module.MapboxMap }));
}

/** Warm on navigation intent, without downloading Mapbox on Home's critical path. */
export function preloadMap() { void loadMap().catch(() => undefined); }
const Renderer = lazy(loadMap);

class MapLoadBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  declare props: { children: React.ReactNode };
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="map-loading" role="alert">
      <p>The map couldn’t load. Check your connection and reload the app.</p>
      <button type="button" className="campus-primary" onClick={() => window.location.reload()}>Reload app</button>
    </div>;
    return this.props.children;
  }
}

export function MapRenderer({ cameraRef, ...props }: MapboxMapProps & { cameraRef: React.Ref<MapCamera> }) {
  // Browsers cache failed module fetches. Reload the document for reliable recovery.
  return <MapLoadBoundary>
    <Suspense fallback={<div className="map-loading" role="status"><span className="skel" aria-hidden="true" />Loading campus map…</div>}>
      <Renderer ref={cameraRef} {...props} />
    </Suspense>
  </MapLoadBoundary>;
}

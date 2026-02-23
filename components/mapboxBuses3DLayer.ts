/**
 * Mapbox custom layer: render bus .glb models at bus positions from buses-source.
 * Uses Three.js; one model instance per bus, positioned and rotated each frame.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import mapboxgl from 'mapbox-gl';
import type { Map } from 'mapbox-gl';

const BUSES_SOURCE_ID = 'buses-source';
const BUS_MODEL_URL = '/models/bus.glb';
const MAX_BUS_MESHES = 20;
/** Bus length in meters for scale (meterInMercator ~3.7e-8; too small = invisible). */
const BUS_LENGTH_METERS = 60;
const BEARING_OFFSET_DEG = 90;
const IS_DEV = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV;

interface BusFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { busId: string; routeId: string; bearing: number };
}

interface Buses3DLayerOptions {
  onSelectBus?: (busId: string) => void;
  /** Returns routeIds that are currently enabled (e.g. from checkbox state). Only these buses are rendered. */
  getEnabledRouteIds?: () => string[];
}

export function createBuses3DLayer(options: Buses3DLayerOptions = {}): mapboxgl.CustomLayerInterface {
  const { onSelectBus, getEnabledRouteIds } = options;
  let map: Map | null = null;
  let camera: THREE.Camera | null = null;
  let scene: THREE.Scene | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let busMeshes: THREE.Group[] = [];
  let modelTemplate: THREE.Group | null = null;
  let meterInMercator: number = 1;

  return {
    id: 'buses-3d-layer',
    type: 'custom',
    renderingMode: '3d',

    onAdd(m: Map, gl: WebGLRenderingContext) {
      map = m;
      camera = new THREE.Camera();
      scene = new THREE.Scene();

      const light1 = new THREE.DirectionalLight(0xffffff, 0.9);
      light1.position.set(0.5, 0.5, 1).normalize();
      scene.add(light1);
      const light2 = new THREE.DirectionalLight(0xffffff, 0.5);
      light2.position.set(-0.3, 0.5, 0.8).normalize();
      scene.add(light2);
      const ambient = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambient);

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;

      if (IS_DEV) {
        fetch(BUS_MODEL_URL)
          .then((r) => console.log('[buses-3d] GLB fetch status:', r.status, BUS_MODEL_URL))
          .catch((e) => console.warn('[buses-3d] GLB fetch error:', e));
      }

      try {
        const loader = new GLTFLoader();
        loader.load(
          BUS_MODEL_URL,
          (gltf) => {
            try {
              const root = gltf.scene;
              root.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                  const mat = (child as THREE.Mesh).material as THREE.Material;
                  if (mat) mat.depthWrite = true;
                }
              });
              modelTemplate = root;
              const box = new THREE.Box3().setFromObject(root);
              const size = box.getSize(new THREE.Vector3());
              const maxDim = Math.max(size.x, size.y, size.z) || 1;
              root.scale.setScalar(1 / maxDim);

              for (let i = 0; i < MAX_BUS_MESHES; i++) {
                const clone = root.clone();
                clone.visible = false;
                scene!.add(clone);
                busMeshes.push(clone);
              }
              if (IS_DEV) console.log('[buses-3d] Bus model loaded, instances:', MAX_BUS_MESHES);
              map?.triggerRepaint();
            } catch (e) {
              console.warn('[buses-3d] Model process error:', e);
              map?.triggerRepaint();
            }
          },
          undefined,
          (err) => {
            console.warn('[buses-3d] Failed to load bus model:', BUS_MODEL_URL, err);
            map?.triggerRepaint();
          }
        );
      } catch (e) {
        console.warn('[buses-3d] GLTFLoader load error:', e);
      }
    },

    onRemove() {
      scene?.clear();
      busMeshes = [];
      modelTemplate = null;
      renderer?.dispose();
      renderer = null;
      scene = null;
      camera = null;
      map = null;
    },

    render(gl: WebGLRenderingContext, matrix: number[]) {
      if (!map || !scene || !camera || !renderer) return;

      if (!modelTemplate) {
        map.triggerRepaint();
        return;
      }

      const src = map.getSource(BUSES_SOURCE_ID) as { _data?: { features?: BusFeature[] }; serialize?: () => { data?: unknown } } | undefined;
      const raw = src ? (src as any)._data : undefined;
      const allFeatures: BusFeature[] = Array.isArray(raw?.features) ? raw.features : [];
      const enabledSet = new Set(getEnabledRouteIds?.() ?? ['p2p-express', 'baity-hill']);
      const features = allFeatures.filter((f) => enabledSet.has(f.properties?.routeId ?? ''));

      if (features.length === 0) {
        busMeshes.forEach((mesh) => { mesh.visible = false; });
        renderer.resetState();
        map.triggerRepaint();
        return;
      }

      try {
        const first = features[0];
        const [lng, lat] = first.geometry.coordinates;
        const merc = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], 0);
        meterInMercator = merc.meterInMercatorCoordinateUnits();

        const scale = meterInMercator * BUS_LENGTH_METERS;
        const bearingOffsetRad = (BEARING_OFFSET_DEG * Math.PI) / 180;

        features.slice(0, MAX_BUS_MESHES).forEach((f, i) => {
          const mesh = busMeshes[i];
          if (!mesh) return;
          const [lon, lat] = f.geometry.coordinates;
          const m = mapboxgl.MercatorCoordinate.fromLngLat([lon, lat], 0.5);
          const bearingRad = ((f.properties?.bearing ?? 0) * Math.PI) / 180 + bearingOffsetRad;

          mesh.position.set(m.x, m.y, m.z);
          mesh.rotation.set(0, 0, 0);
          mesh.rotateY(-bearingRad);
          mesh.scale.setScalar(scale);
          mesh.visible = true;
        });

        for (let i = features.length; i < MAX_BUS_MESHES; i++) {
          if (busMeshes[i]) busMeshes[i].visible = false;
        }

        const m = new THREE.Matrix4().fromArray(matrix);
        camera.projectionMatrix = m;
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        renderer.resetState();
        renderer.render(scene, camera);
      } catch (e) {
        if (IS_DEV) console.warn('[buses-3d] render error:', e);
      }
      map.triggerRepaint();
    },
  };
}

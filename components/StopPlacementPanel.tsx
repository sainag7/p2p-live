/**
 * Dev-only panel for digitizing stop locations from the official P2P map.
 * Shown when ?devStops=1 and import.meta.env.DEV.
 * Click map to capture (lng, lat); export JSON for data/p2pStops.
 */

import React from 'react';
import { Copy, Download, Trash2 } from 'lucide-react';

export interface CapturedPoint {
  lng: number;
  lat: number;
  name?: string;
  route?: 'P2P_EXPRESS' | 'BAITY_HILL';
  order?: number;
}

const POINT_SNIPPET = (p: CapturedPoint) =>
  `{ lng: ${p.lng}, lat: ${p.lat} }`;

function exportAsP2pStops(points: CapturedPoint[]): string {
  const lines = points.map(
    (p, i) =>
      `  { stopId: 'stop-${i + 1}', name: '${(p.name || `Stop ${i + 1}`).replace(/'/g, "\\'")}', route: '${p.route || 'P2P_EXPRESS'}', lat: ${p.lat}, lon: ${p.lng}, order: ${p.order ?? i + 1} },`
  );
  return `const P2P_STOPS_DATA: P2PStopInput[] = [\n${lines.join('\n')}\n];`;
}

interface StopPlacementPanelProps {
  points: CapturedPoint[];
  onClear: () => void;
  onRemove: (index: number) => void;
  onUpdatePoint: (index: number, updates: Partial<CapturedPoint>) => void;
}

export function StopPlacementPanel({ points, onClear, onRemove, onUpdatePoint }: StopPlacementPanelProps) {
  const copySnippet = (p: CapturedPoint) => {
    const text = POINT_SNIPPET(p);
    navigator.clipboard.writeText(text).then(() => console.log('Copied:', text));
  };

  const copyExport = () => {
    const text = exportAsP2pStops(points);
    navigator.clipboard.writeText(text).then(() => console.log('Export copied to clipboard'));
  };

  const downloadExport = () => {
    const text = exportAsP2pStops(points);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'p2pStops-export.ts';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="absolute top-14 left-3 right-3 max-w-sm z-[500] bg-white rounded-xl shadow-lg border border-gray-200 p-3 max-h-[50vh] flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-gray-500 uppercase">Stop placement (dev)</span>
        <button
          type="button"
          onClick={onClear}
          className="text-gray-400 hover:text-red-600 p-1"
          aria-label="Clear all"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <ul className="overflow-y-auto flex-1 space-y-1 text-xs mb-2">
        {points.map((p, i) => (
          <li key={i} className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-500">#{i + 1}</span>
            <input
              type="text"
              placeholder="Name"
              value={p.name ?? ''}
              onChange={(e) => onUpdatePoint(i, { name: e.target.value || undefined })}
              className="flex-1 min-w-0 rounded border border-gray-200 px-1.5 py-0.5"
            />
            <span className="text-gray-400 truncate">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</span>
            <button
              type="button"
              onClick={() => copySnippet(p)}
              className="p-1 text-p2p-blue hover:underline"
              title="Copy snippet"
            >
              <Copy size={12} />
            </button>
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="p-1 text-gray-400 hover:text-red-600"
              aria-label="Remove"
            >
              <Trash2 size={12} />
            </button>
          </li>
        ))}
        {points.length === 0 && (
          <li className="text-gray-400">Click map to add a point</li>
        )}
      </ul>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copyExport}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-p2p-blue text-white rounded text-xs font-medium"
        >
          <Copy size={12} /> Copy JSON
        </button>
        <button
          type="button"
          onClick={downloadExport}
          className="flex items-center justify-center gap-1 px-2 py-1.5 bg-gray-100 text-gray-700 rounded text-xs font-medium"
        >
          <Download size={12} /> Export
        </button>
      </div>
    </div>
  );
}

/** True when dev build and ?devStops=1. */
export function isStopPlacementModeEnabled(): boolean {
  if (import.meta.env.PROD) return false;
  try {
    return new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('devStops') === '1';
  } catch {
    return false;
  }
}

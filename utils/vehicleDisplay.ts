import type { LiveVehicle } from '../types';

export interface LoadInfo {
  percent: number;
  riders: number | null;
  capacity: number | null;
}

export function getLoadInfo(v: Pick<LiveVehicle, 'load' | 'capacity'>): LoadInfo | null {
  if (v.load == null) return null;
  return {
    percent: Math.round(v.load * 100),
    riders: v.capacity != null ? Math.round(v.load * v.capacity) : null,
    capacity: v.capacity,
  };
}

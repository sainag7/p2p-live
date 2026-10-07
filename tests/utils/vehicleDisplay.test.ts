import { describe, it, expect } from 'vitest';
import { getLoadInfo } from '../../utils/vehicleDisplay';

describe('getLoadInfo', () => {
  it('computes percent and riders from load and capacity', () => {
    expect(getLoadInfo({ load: 0.375, capacity: 48 })).toEqual({ percent: 38, riders: 18, capacity: 48 });
  });
  it('returns percent only when capacity is unknown', () => {
    expect(getLoadInfo({ load: 0.5, capacity: null })).toEqual({ percent: 50, riders: null, capacity: null });
  });
  it('returns null when load is unknown', () => {
    expect(getLoadInfo({ load: null, capacity: 48 })).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { isNewSpot, type LocationReading } from '../../utils/liveLocation';

// About 111 m per 0.001° of latitude.
const at = (northMeters: number, accuracy: number): LocationReading => ({ lat: 35.9 + northMeters / 111000, lon: -79.05, accuracy, time: 0 });

describe('isNewSpot', () => {
  const shown = at(0, 20);
  it('ignores GPS wobble while standing still', () => {
    expect(isNewSpot(shown, at(1.5, 20))).toBe(false);
  });
  it('takes a real move or a clearly more precise reading', () => {
    expect(isNewSpot(shown, at(5, 20))).toBe(true);
    expect(isNewSpot(shown, at(0, 8))).toBe(true);
    expect(isNewSpot(null, shown)).toBe(true);
  });
});

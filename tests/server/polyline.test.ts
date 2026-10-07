import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { decodePolyline, lineLengthMeters } = require('../../server/gmv/polyline.cjs');

describe('decodePolyline', () => {
  it('decodes the reference vector from the Google polyline docs as [lng, lat]', () => {
    const coords = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(coords).toHaveLength(3);
    expect(coords[0][0]).toBeCloseTo(-120.2, 5);
    expect(coords[0][1]).toBeCloseTo(38.5, 5);
    expect(coords[1][0]).toBeCloseTo(-120.95, 5);
    expect(coords[1][1]).toBeCloseTo(40.7, 5);
    expect(coords[2][0]).toBeCloseTo(-126.453, 5);
    expect(coords[2][1]).toBeCloseTo(43.252, 5);
  });

  it('returns [] for empty or non-string input', () => {
    expect(decodePolyline('')).toEqual([]);
    expect(decodePolyline(null)).toEqual([]);
  });
});

describe('lineLengthMeters', () => {
  it('measures 0.001 degrees of latitude as about 111 m', () => {
    expect(lineLengthMeters([[-79.05, 35.9], [-79.05, 35.901]])).toBeCloseTo(111.19, 1);
  });

  it('returns 0 for fewer than two points', () => {
    expect(lineLengthMeters([[-79.05, 35.9]])).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { formatEta } from '../../utils/format';

describe('formatEta', () => {
  it('says Arriving under a minute', () => {
    expect(formatEta(0)).toBe('Arriving');
    expect(formatEta(59)).toBe('Arriving');
  });
  it('floors to whole minutes', () => {
    expect(formatEta(60)).toBe('1 min');
    expect(formatEta(119)).toBe('1 min');
    expect(formatEta(600)).toBe('10 min');
  });
  it('shows a dash for missing values', () => {
    expect(formatEta(null)).toBe('—');
    expect(formatEta(undefined)).toBe('—');
    expect(formatEta(Number.NaN)).toBe('—');
  });
});

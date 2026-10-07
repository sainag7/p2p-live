import { describe, expect, it } from 'vitest';
import { highlightMatch, searchCampusPlaces } from '../../utils/placeSearch';

describe('searchCampusPlaces', () => {
  it('finds places by nickname as well as name', () => {
    expect(searchCampusPlaces('canes').map(p => p.name)).toContain("Raising Cane's");
  });
  it('lists name matches before places that only match a nickname or address', () => {
    const names = searchCampusPlaces('franklin').map(p => p.name);
    expect(names.length).toBeGreaterThan(1);
    const firstAliasOnly = names.findIndex(n => !n.toLowerCase().includes('franklin'));
    expect(names.slice(0, firstAliasOnly < 0 ? names.length : firstAliasOnly).every(n => n.toLowerCase().includes('franklin'))).toBe(true);
    expect(names.slice(firstAliasOnly < 0 ? names.length : firstAliasOnly).some(n => n.toLowerCase().includes('franklin'))).toBe(false);
  });
  it('returns nothing for an empty query', () => {
    expect(searchCampusPlaces('   ')).toEqual([]);
  });
});

describe('highlightMatch', () => {
  it('splits around the first case-insensitive match', () => {
    expect(highlightMatch('Chase Dining Hall', 'din')).toEqual({ before: 'Chase ', match: 'Din', after: 'ing Hall' });
  });
  it('leaves text whole when nothing matches', () => {
    expect(highlightMatch('Davis Library', 'gym')).toEqual({ before: 'Davis Library', match: '', after: '' });
  });
});

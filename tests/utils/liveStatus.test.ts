import { describe, it, expect } from 'vitest';
import { getLiveStatusMessage } from '../../utils/liveStatus';

describe('getLiveStatusMessage', () => {
  it('shows nothing while live or loading', () => {
    expect(getLiveStatusMessage('live')).toBeNull();
    expect(getLiveStatusMessage('loading')).toBeNull();
  });
  it('warns when data is delayed or unavailable', () => {
    expect(getLiveStatusMessage('degraded')).toMatchObject({ tone: 'warning', text: expect.stringContaining('delayed') });
    expect(getLiveStatusMessage('unavailable')).toMatchObject({ tone: 'warning', text: expect.stringContaining('scheduled times') });
  });
  it('explains no service outside service hours', () => {
    expect(getLiveStatusMessage('no-service', new Date(2026, 8, 14, 12, 0))?.text).toBe('No buses running — service starts 7:00 PM.');
  });
  it('explains missing buses during service hours', () => {
    expect(getLiveStatusMessage('no-service', new Date(2026, 8, 14, 21, 0))?.text).toContain('No buses are reporting');
  });
});

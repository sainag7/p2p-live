import { describe, expect, it } from 'vitest';
import { PUBLIC_RIDER_PATH, publicRiderPath } from '../../utils/publicRouting';

describe('public rider routing', () => {
  it('keeps the rider app as the only entry route', () => {
    expect(PUBLIC_RIDER_PATH).toBe('/');
  });

  it.each(['/ops/login', '/ops/admin', '/ops/manager', '/ops/driver', '/messages', '/unknown'])(
    'redirects retired path %s to the rider app',
    (path) => {
      expect(publicRiderPath(path)).toBe('/');
    },
  );
});

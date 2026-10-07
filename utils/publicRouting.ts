/** The public rider app intentionally exposes one entry route. */
export const PUBLIC_RIDER_PATH = '/';

/** Unknown, retired, and formerly authenticated URLs always return to the rider app. */
export function publicRiderPath(_pathname: string): typeof PUBLIC_RIDER_PATH {
  return PUBLIC_RIDER_PATH;
}

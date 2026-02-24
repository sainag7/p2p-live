const STORAGE_KEY = 'p2p_recent_searches_v2';
const MAX_ITEMS = 8;
const EXPIRE_DAYS = 14;

export interface RecentSearchItem {
  label: string;
  /** Full address string if available (e.g. from geocode). */
  address?: string;
  timestamp: number;
  lat?: number;
  lon?: number;
}

function getExpiryCutoff(): number {
  const d = new Date();
  d.setDate(d.getDate() - EXPIRE_DAYS);
  return d.getTime();
}

function loadRaw(): RecentSearchItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentSearchItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Returns recent searches, most recent first, deduped, expired removed, max 8. */
export function getRecentSearches(): RecentSearchItem[] {
  const cutoff = getExpiryCutoff();
  const items = loadRaw()
    .filter((item) => item.timestamp >= cutoff && item.label?.trim())
    .slice(0, MAX_ITEMS);
  return items;
}

/** Normalize key for dedupe: same destination by name (and optional address). */
function dedupeKey(item: RecentSearchItem): string {
  const name = (item.label || '').trim().toLowerCase();
  const addr = (item.address || '').trim().toLowerCase();
  return addr ? `${name}|${addr}` : name;
}

/** Add or move-to-top by label/address. Dedupes (same name/address moves to top), max 8, writes to localStorage. */
export function addRecentSearch(item: Omit<RecentSearchItem, 'timestamp'>): void {
  const ts = Date.now();
  const next: RecentSearchItem = { ...item, timestamp: ts };
  const cutoff = getExpiryCutoff();
  const existing = loadRaw().filter((i) => i.timestamp >= cutoff);
  const nextKey = dedupeKey(next);
  const without = existing.filter((i) => dedupeKey(i) !== nextKey);
  const merged = [next, ...without].slice(0, MAX_ITEMS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // quota or disabled
  }
}

/** Remove all recent searches. */
export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

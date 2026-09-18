/**
 * In-memory TTL cache for AniList and Fandom API responses.
 * Prevents redundant network requests during background sync cycles.
 * ponytail: upgrade to Redis/SQLite when multi-process or persistence needed.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function cacheSet<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function cacheHas(key: string): boolean {
  return cacheGet(key) !== null;
}

export function cacheClear(): void {
  store.clear();
}

export function cacheStats(): { size: number; keys: string[] } {
  // Prune expired entries
  for (const [k, v] of store) {
    if (Date.now() > v.expiresAt) store.delete(k);
  }
  return { size: store.size, keys: Array.from(store.keys()) };
}

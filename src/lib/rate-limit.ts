/**
 * Tiny in-memory fixed-window rate limiter for sensitive endpoints (login).
 *
 * Per-process and un-persisted — adequate for a single-admin login behind a
 * single Node process. If this ever moves to multi-instance/serverless, swap
 * the store for Redis/Upstash and keep the same `checkRateLimit` signature.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may try again (0 when allowed). */
  retryAfterSeconds: number;
}

/**
 * @param key      identity to limit on (e.g. client IP)
 * @param limit    max attempts inside the window
 * @param windowMs window length
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || now >= bucket.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count < limit) {
    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

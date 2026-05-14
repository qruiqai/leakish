/**
 * Tiny in-process rate limiter (token-bucket / fixed-window hybrid).
 *
 * Scope: single-pod best-effort. Survives nothing — pod restart, multi-replica
 * scale-out, or a horizontal autoscaler all reset the counters. That's
 * acceptable because the *upper bound* on damage is `limit * pod_count`, which
 * for V1 dev/staging is small enough to not matter.
 *
 * For prod-grade limits we'd swap this for Redis (`INCR` + `EXPIRE`) or
 * Cloudflare Rate Limiting Rules at the edge — both can drop in behind the
 * same `enforce()` API.
 *
 * Usage:
 *   const limiter = createLimiter({ windowMs: 60_000, max: 10 });
 *   const result = limiter.consume(`save:${userId}`);
 *   if (!result.allowed) return 429 with retryAfter;
 */

export interface RateLimiterConfig {
  /** Window size in ms (e.g. 3_600_000 for "per hour"). */
  windowMs: number;
  /** Max events allowed per window. */
  max: number;
}

export interface ConsumeResult {
  allowed: boolean;
  /** Remaining events in the current window after this consume. */
  remaining: number;
  /** Seconds until the window resets, suitable for the `Retry-After` header. */
  retryAfterSec: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  consume(key: string): ConsumeResult;
}

export function createLimiter(config: RateLimiterConfig): RateLimiter {
  const buckets = new Map<string, Bucket>();

  // Periodically prune expired buckets so the map doesn't grow unbounded.
  // The interval is unref'd so it never holds the process open.
  if (typeof setInterval === 'function') {
    const t = setInterval(
      () => {
        const now = Date.now();
        const expired: string[] = [];
        buckets.forEach((b, k) => {
          if (b.resetAt <= now) expired.push(k);
        });
        expired.forEach(k => buckets.delete(k));
      },
      Math.max(config.windowMs, 60_000)
    );
    if (typeof t === 'object' && 'unref' in t) (t as { unref: () => void }).unref();
  }

  return {
    consume(key: string): ConsumeResult {
      const now = Date.now();
      const existing = buckets.get(key);

      if (!existing || existing.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + config.windowMs });
        return { allowed: true, remaining: config.max - 1, retryAfterSec: 0 };
      }

      if (existing.count >= config.max) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
        };
      }

      existing.count += 1;
      return {
        allowed: true,
        remaining: config.max - existing.count,
        retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    },
  };
}

/**
 * Singleton limiters for the well-known endpoints. Importing creates them once
 * per process — exactly what we want.
 */
export const saveScanLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
export const uniquenessLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 60 });
/** Per-IP brute-force guard on the API-key admission endpoint. */
export const apiKeyLoginLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
/** Per-user guard on the server-side network probe (does an ipinfo.io lookup). */
export const networkProbeLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 60 });
/** Per-user guard on API-key creation. Hard cap is 20 keys; this throttles churn. */
export const keyCreateLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
/** Per-user guard on the analytics aggregate endpoint (cheap, server-only compute). */
export const analyticsLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 60 });

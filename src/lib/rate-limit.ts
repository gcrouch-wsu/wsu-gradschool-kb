/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * State lives on globalThis so it survives module reloads within a server
 * process. This is the documented MVP approach (project_spec.md §4/§20). Note the
 * limitation: on serverless/Fluid Compute each instance keeps its own counters,
 * so limits are per-instance rather than global. A shared store (e.g. Upstash
 * Redis) should replace this before relying on it as a hard security control.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const globalForRateLimit = globalThis as unknown as {
  __kbRateBuckets?: Map<string, Bucket>;
};

function buckets(): Map<string, Bucket> {
  if (!globalForRateLimit.__kbRateBuckets) {
    globalForRateLimit.__kbRateBuckets = new Map();
  }
  return globalForRateLimit.__kbRateBuckets;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const store = buckets();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/** Best-effort client key derived from forwarding headers. */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

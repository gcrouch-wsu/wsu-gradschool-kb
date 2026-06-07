import { ensureSchema, getSql, isDatabaseEnabled } from "@/lib/db";

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

function memoryRateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
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

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  if (!isDatabaseEnabled()) {
    return memoryRateLimit(key, limit, windowSeconds);
  }

  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    WITH input AS (
      SELECT
        now() AS now_ts,
        (${windowSeconds}::int * interval '1 second') AS window_len
    ),
    upserted AS (
      INSERT INTO kb_rate_limits (bucket_key, count, reset_at, updated_at)
      SELECT ${key}, 1, now_ts + window_len, now_ts
      FROM input
      ON CONFLICT (bucket_key) DO UPDATE SET
        count = CASE
          WHEN kb_rate_limits.reset_at <= (SELECT now_ts FROM input) THEN 1
          ELSE kb_rate_limits.count + 1
        END,
        reset_at = CASE
          WHEN kb_rate_limits.reset_at <= (SELECT now_ts FROM input) THEN (SELECT now_ts + window_len FROM input)
          ELSE kb_rate_limits.reset_at
        END,
        updated_at = (SELECT now_ts FROM input)
      RETURNING count, reset_at
    )
    SELECT
      count,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM reset_at - (SELECT now_ts FROM input)))::int) AS retry_after_seconds
    FROM upserted
  `) as unknown as Array<{ count: number; retry_after_seconds: number }>;

  const row = rows[0];
  const count = row?.count ?? limit + 1;
  const allowed = count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: allowed ? 0 : row?.retry_after_seconds ?? windowSeconds,
  };
}

export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

import "server-only";
import { db } from "../db";

/**
 * Shared fixed-window counters stored in PostgreSQL (works across serverless instances; ADR-001).
 * Used for credential throttling and admin import endpoints only — not on the answer-save hot path.
 */
export async function hit(key: string, windowSeconds: number): Promise<{ count: number; resetAt: Date }> {
  const rows = await db.$queryRaw<{ count: number; window_start: Date }[]>`
    INSERT INTO rate_limit_bucket (key, window_start, count) VALUES (${key}, clock_timestamp(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit_bucket.window_start <= clock_timestamp() - make_interval(secs => ${windowSeconds})
                   THEN 1 ELSE rate_limit_bucket.count + 1 END,
      window_start = CASE WHEN rate_limit_bucket.window_start <= clock_timestamp() - make_interval(secs => ${windowSeconds})
                   THEN clock_timestamp() ELSE rate_limit_bucket.window_start END
    RETURNING count, window_start`;
  const r = rows[0]!;
  return { count: r.count, resetAt: new Date(r.window_start.getTime() + windowSeconds * 1000) };
}

/** Current count without incrementing (0 when the window expired). */
export async function peek(key: string, windowSeconds: number): Promise<{ count: number; resetAt: Date }> {
  const rows = await db.$queryRaw<{ count: number; window_start: Date }[]>`
    SELECT count, window_start FROM rate_limit_bucket
    WHERE key = ${key} AND window_start > clock_timestamp() - make_interval(secs => ${windowSeconds})`;
  const r = rows[0];
  return r ? { count: r.count, resetAt: new Date(r.window_start.getTime() + windowSeconds * 1000) } : { count: 0, resetAt: new Date() };
}

export async function reset(key: string): Promise<void> {
  await db.rateLimitBucket.deleteMany({ where: { key } });
}

/** Housekeeping: delete stale buckets (called by job runner). */
export async function purgeStale(olderThanSeconds = 86_400): Promise<number> {
  return db.$executeRaw`DELETE FROM rate_limit_bucket WHERE window_start < clock_timestamp() - make_interval(secs => ${olderThanSeconds})`;
}

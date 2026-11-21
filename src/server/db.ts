import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

/**
 * One Prisma client per server instance, reused across requests (and across hot reloads in dev).
 * Pool size is bounded (DATABASE_POOL_MAX); in production DATABASE_URL is Neon's pooled endpoint
 * (PgBouncer, transaction mode). Session settings are therefore NOT set at connect time: PgBouncer
 * does not keep them per client. Timeouts are applied per transaction with SET LOCAL (see tx()).
 * UTC is the database default (migration 20261120000200); PgBouncer restores TimeZone per client.
 */
function create(): PrismaClient {
  const e = env();
  const adapter = new PrismaPg({
    connectionString: e.DATABASE_URL,
    max: e.DATABASE_POOL_MAX,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

const g = globalThis as unknown as { __prisma?: PrismaClient };
export const db: PrismaClient = g.__prisma ?? create();
if (env().APP_ENV !== "production") g.__prisma = db;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Short interactive transaction with bounded wait/timeout (never spans network calls).
 * - lock_timeout 5 s: a request queued behind a held attempt lock fails fast (TEMPORARY_FAILURE → client retries)
 * - statement_timeout: guards runaway statements while locks are held
 * SET LOCAL ends with the transaction, so it is safe on pooled (transaction-mode) connections.
 */
export function tx<T>(fn: (t: Tx) => Promise<T>, opts?: { timeoutMs?: number }): Promise<T> {
  const timeout = opts?.timeoutMs ?? 10_000;
  return db.$transaction(
    async (t) => {
      // Values are compile-time constants / integers (no user input reaches these statements).
      await t.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
      await t.$executeRawUnsafe(`SET LOCAL statement_timeout = '${Math.floor(timeout)}ms'`);
      return fn(t);
    },
    { maxWait: 5_000, timeout },
  );
}

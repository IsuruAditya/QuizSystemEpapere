import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "../db";
import { logger } from "./logger";

/**
 * Durable job table (ADR-007): at-least-once execution with leases. Handlers MUST be idempotent.
 * Enqueue inside the caller's transaction (transactional outbox) so committed work is never lost.
 */
export type JobType = "GRADE_ATTEMPT" | "REGRADE_EXAM_VERSION";

export async function enqueue(
  t: Tx,
  type: JobType,
  payload: Prisma.InputJsonValue,
  opts: { dedupeKey?: string; runAfterSeconds?: number; maxAttempts?: number } = {},
): Promise<void> {
  const runAfter = new Date(Date.now() + (opts.runAfterSeconds ?? 0) * 1000);
  if (opts.dedupeKey) {
    // Re-queue a finished job with the same key (e.g. second regrade) instead of duplicating.
    await t.$executeRaw`
      INSERT INTO job (id, type, payload, status, attempts, max_attempts, run_after, dedupe_key, created_at, updated_at)
      VALUES (gen_random_uuid(), ${type}, ${JSON.stringify(payload)}::jsonb, 'QUEUED', 0, ${opts.maxAttempts ?? 5}, ${runAfter}, ${opts.dedupeKey}, now(), now())
      ON CONFLICT (dedupe_key) DO UPDATE SET
        payload = EXCLUDED.payload,
        status = CASE WHEN job.status = 'RUNNING' THEN job.status ELSE 'QUEUED'::"JobStatus" END,
        attempts = CASE WHEN job.status = 'RUNNING' THEN job.attempts ELSE 0 END,
        run_after = LEAST(job.run_after, EXCLUDED.run_after),
        last_error = NULL,
        updated_at = now()`;
    return;
  }
  await t.job.create({ data: { type, payload, runAfter, maxAttempts: opts.maxAttempts ?? 5 } });
}

interface ClaimedJob {
  id: string;
  type: JobType;
  payload: Prisma.JsonValue;
  attempts: number;
  max_attempts: number;
}

const LEASE_SECONDS = 120;

/** Claim up to `n` due jobs (or jobs whose lease expired after a crash) without blocking other runners. */
export async function claim(n: number): Promise<ClaimedJob[]> {
  return db.$queryRaw<ClaimedJob[]>`
    UPDATE job SET status = 'RUNNING', attempts = attempts + 1,
      lease_until = now() + make_interval(secs => ${LEASE_SECONDS}), updated_at = now()
    WHERE id IN (
      SELECT id FROM job
      WHERE (status = 'QUEUED' AND run_after <= now()) OR (status = 'RUNNING' AND lease_until < now())
      ORDER BY run_after
      LIMIT ${n}
      FOR UPDATE SKIP LOCKED)
    RETURNING id, type, payload, attempts, max_attempts`;
}

export async function complete(id: string, progress?: Prisma.InputJsonValue): Promise<void> {
  await db.job.update({ where: { id }, data: { status: "SUCCEEDED", leaseUntil: null, progress: progress ?? undefined } });
}

/** Requeue for continuation (bounded batch done, more work remains) without consuming a retry. */
export async function continueLater(id: string, progress: Prisma.InputJsonValue): Promise<void> {
  await db.$executeRaw`UPDATE job SET status = 'QUEUED', attempts = GREATEST(attempts - 1, 0), lease_until = NULL,
    run_after = now(), progress = ${JSON.stringify(progress)}::jsonb, updated_at = now() WHERE id = ${id}::uuid`;
}

export async function failAttempt(job: ClaimedJob, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
  const terminal = job.attempts >= job.max_attempts;
  const backoff = Math.min(3600, 10 * 2 ** job.attempts);
  await db.$executeRaw`UPDATE job SET status = ${terminal ? "FAILED" : "QUEUED"}::"JobStatus", lease_until = NULL,
    run_after = now() + make_interval(secs => ${backoff}), last_error = ${message}, updated_at = now() WHERE id = ${job.id}::uuid`;
  logger.warn("job attempt failed", { jobId: job.id, type: job.type, attempt: job.attempts, terminal, error: message });
}

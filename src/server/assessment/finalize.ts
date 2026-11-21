import "server-only";
import type { Tx } from "../db";
import { enqueue } from "../platform/jobs";
import { logger } from "../platform/logger";
import { elapsedMs } from "./deadline";
import { gradeAttempt, GradingError, type KeyEntry } from "./grading";

/** Row shape returned by `lockAttempt` (snake_case raw columns). */
export interface LockedAttempt {
  id: string;
  user_id: string;
  exam_id: string;
  exam_version_id: string;
  kind: "OFFICIAL" | "PRACTICE";
  status: "IN_PROGRESS" | "SUBMITTED" | "GRADED";
  started_at: Date;
  deadline_at: Date | null;
  submitted_at: Date | null;
  elapsed_ms: number | null;
  revision: number;
  controller_token: string;
  last_mutation_id: string | null;
  voided_at: Date | null;
  now: Date;
}

/** Lock one attempt row for the rest of the transaction and read the server clock under the lock. */
export async function lockAttempt(t: Tx, attemptId: string, opts: { userId?: string; skipLocked?: boolean } = {}): Promise<LockedAttempt | null> {
  const rows = opts.skipLocked
    ? await t.$queryRaw<LockedAttempt[]>`
        SELECT id, user_id, exam_id, exam_version_id, kind, status, started_at, deadline_at, submitted_at, elapsed_ms,
               revision, controller_token::text AS controller_token, last_mutation_id::text AS last_mutation_id, voided_at, clock_timestamp() AS now
        FROM attempt WHERE id = ${attemptId}::uuid FOR UPDATE SKIP LOCKED`
    : await t.$queryRaw<LockedAttempt[]>`
        SELECT id, user_id, exam_id, exam_version_id, kind, status, started_at, deadline_at, submitted_at, elapsed_ms,
               revision, controller_token::text AS controller_token, last_mutation_id::text AS last_mutation_id, voided_at, clock_timestamp() AS now
        FROM attempt WHERE id = ${attemptId}::uuid FOR UPDATE`;
  const a = rows[0];
  if (!a) return null;
  if (opts.userId && a.user_id !== opts.userId) return null;
  // clock_timestamp() in the same statement is evaluated before the lock wait completes; re-read it.
  const [{ now }] = (await t.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`) as [{ now: Date }];
  a.now = now;
  return a;
}

export async function loadKeys(t: Tx, examVersionId: string): Promise<{ revisionId: string; keys: KeyEntry[] }> {
  const v = await t.examVersion.findUniqueOrThrow({ where: { id: examVersionId }, select: { latestGradingRevisionId: true } });
  if (!v.latestGradingRevisionId) throw new GradingError("Exam version has no grading revision.");
  const keys = await t.gradingKey.findMany({
    where: { gradingRevisionId: v.latestGradingRevisionId },
    select: { examQuestionId: true, correctOptionId: true, marks: true },
  });
  return { revisionId: v.latestGradingRevisionId, keys };
}

async function loadAnswers(t: Tx, attemptId: string): Promise<Map<string, string | null>> {
  const rows = await t.attemptAnswer.findMany({ where: { attemptId }, select: { examQuestionId: true, optionId: true } });
  return new Map(rows.map((r) => [r.examQuestionId, r.optionId]));
}

/**
 * Finalise a locked IN_PROGRESS attempt and grade it in the same transaction (ADR-005).
 * - MANUAL: receiptAt = server time under lock (must be < deadline; caller checked).
 * - EXPIRED: receipt is the deadline; elapsed = deadline − start.
 * A grading fault (bad key data) commits the submission as SUBMITTED with NULL score and queues
 * a GRADE_ATTEMPT job; it never writes a fake score. DB errors propagate and roll back.
 */
export async function finalizeLocked(t: Tx, a: LockedAttempt, reason: "MANUAL" | "EXPIRED"): Promise<void> {
  const submittedAt = reason === "EXPIRED" ? (a.deadline_at ?? a.now) : a.now;
  const elapsed = elapsedMs(reason, a.started_at, a.now, a.deadline_at);
  await t.$executeRaw`UPDATE attempt SET status = 'SUBMITTED', submitted_at = ${submittedAt}, finalize_reason = ${reason}::"FinalizeReason",
    elapsed_ms = ${elapsed} WHERE id = ${a.id}::uuid AND status = 'IN_PROGRESS'`;
  await gradeLocked(t, a.id, a.exam_version_id);
}

/** Grade (or regrade) a finalised attempt against the version's latest grading revision. Idempotent. */
export async function gradeLocked(t: Tx, attemptId: string, examVersionId: string): Promise<boolean> {
  let graded;
  let revisionId: string;
  try {
    const k = await loadKeys(t, examVersionId);
    revisionId = k.revisionId;
    graded = gradeAttempt(k.keys, await loadAnswers(t, attemptId));
  } catch (e) {
    if (!(e instanceof GradingError)) throw e;
    logger.error("grading fault; attempt left SUBMITTED with null score", { attemptId, error: e.message });
    await enqueue(t, "GRADE_ATTEMPT", { attemptId }, { dedupeKey: `grade:${attemptId}`, runAfterSeconds: 30 });
    return false;
  }
  await t.$executeRaw`UPDATE attempt SET status = 'GRADED', score = ${graded.score}, max_score = ${graded.maxScore},
    percent_bp = ${graded.percentBp}, grading_revision_id = ${revisionId}::uuid, graded_at = clock_timestamp()
    WHERE id = ${attemptId}::uuid AND status IN ('SUBMITTED', 'GRADED')`;
  await t.$executeRaw`INSERT INTO attempt_grade (attempt_id, grading_revision_id, score, max_score, graded_at)
    VALUES (${attemptId}::uuid, ${revisionId}::uuid, ${graded.score}, ${graded.maxScore}, clock_timestamp())
    ON CONFLICT (attempt_id, grading_revision_id) DO NOTHING`;
  return true;
}

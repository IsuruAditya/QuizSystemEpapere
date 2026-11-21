import "server-only";
import { db, tx, type Tx } from "../db";
import { AppError } from "../http/app-error";
import { availability, computeDeadline, isLateStart } from "./deadline";
import { isEligible } from "./eligibility";
import { finalizeLocked, lockAttempt, type LockedAttempt } from "./finalize";
import { versionSlots } from "./version-slots";
import { buildAttemptView, type AttemptView } from "./attempt-view";
import type { Actor } from "../auth/actor";
import { saveBody, submitBody, type SaveBody, type SubmitBody } from "./schemas";
export { saveBody, submitBody, type SaveBody, type SubmitBody };


/* ───────────────────────── start / resume ───────────────────────── */

export interface StartResult {
  attemptId: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "GRADED";
  created: boolean;
  /** Present when this tab became the writable controller (new attempt or explicit takeover). */
  controllerToken: string | null;
}

/**
 * Start or resume (R5.1–R5.5). Idempotent under concurrency: partial unique indexes guarantee one
 * in-progress attempt and one non-void official attempt; losers of the insert race read the winner.
 */
export async function startAttempt(actor: Actor, slug: string, opts: { takeover: boolean }): Promise<StartResult> {
  const exam = await db.exam.findUnique({
    where: { slug },
    select: {
      id: true,
      status: true,
      gradeId: true,
      mode: true,
      opensAt: true,
      closesAt: true,
      durationSeconds: true,
      allowLateStart: true,
      maxAttempts: true,
      currentVersionId: true,
    },
  });
  if (!exam) throw new AppError("NOT_FOUND", "Exam not found.");
  const user = await db.user.findUnique({
    where: { id: actor.userId },
    select: { disabled: true, role: true, profile: { select: { gradeId: true } } },
  });
  const elig = isEligible({
    role: user?.role ?? "STUDENT",
    disabled: user?.disabled ?? true,
    studentGradeId: user?.profile?.gradeId ?? null,
    examStatus: exam.status,
    examGradeId: exam.gradeId,
  });
  if (!elig.ok) throw new AppError(elig.reason === "NOT_PUBLISHED" ? "NOT_FOUND" : "ACCESS_DENIED", "You cannot take this exam.", { reason: elig.reason });
  if (!exam.currentVersionId) throw new AppError("NOT_FOUND", "Exam not found.");
  const kind = exam.mode === "RANKED" ? "OFFICIAL" : "PRACTICE";

  // 1. Existing in-progress attempt → resume (finalising lazily if its deadline passed).
  const existing = await db.attempt.findFirst({ where: { examId: exam.id, userId: actor.userId, status: "IN_PROGRESS" }, select: { id: true } });
  if (existing) {
    const r = await resumeOrExpire(existing.id, actor.userId, opts.takeover);
    if (r.status === "IN_PROGRESS" || kind === "OFFICIAL") return r;
  }

  // 2. Ranked: an existing official attempt (finalised) is the answer; voided ones may grant a replacement.
  let replacesAttemptId: string | null = null;
  if (kind === "OFFICIAL") {
    const official = await db.attempt.findFirst({ where: { examId: exam.id, userId: actor.userId, kind: "OFFICIAL", voidedAt: null }, select: { id: true, status: true } });
    if (official) return { attemptId: official.id, status: official.status, created: false, controllerToken: null };
    const grant = await db.attempt.findFirst({
      where: { examId: exam.id, userId: actor.userId, kind: "OFFICIAL", voidedAt: { not: null }, replacementGranted: true, replacedBy: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const anyVoided = await db.attempt.count({ where: { examId: exam.id, userId: actor.userId, kind: "OFFICIAL" } });
    if (anyVoided > 0 && !grant) throw new AppError("NO_ATTEMPTS_REMAINING", "You have already used your attempt for this exam.");
    replacesAttemptId = grant?.id ?? null;
  } else if (exam.maxAttempts !== null) {
    const used = await db.attempt.count({ where: { examId: exam.id, userId: actor.userId, kind: "PRACTICE", voidedAt: null } });
    if (used >= exam.maxAttempts) throw new AppError("NO_ATTEMPTS_REMAINING", "You have used all attempts for this practice exam.");
  }

  // 3. Window checks against the database clock.
  const [{ now }] = (await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`) as [{ now: Date }];
  const av = availability(exam, now);
  if (av === "UPCOMING") throw new AppError("NOT_OPEN", "This exam has not opened yet.", { opensAt: exam.opensAt?.toISOString() });
  if (av === "CLOSED") throw new AppError("CLOSED", "This exam has closed.");
  if (!exam.allowLateStart && isLateStart(now, exam.durationSeconds, exam.closesAt))
    throw new AppError("CLOSED", "Late starts are not allowed and not enough time remains.");
  if (kind === "OFFICIAL" && computeDeadline(now, exam.durationSeconds, exam.closesAt) === null)
    throw new AppError("CLOSED", "This ranked exam is misconfigured (no deadline).");

  // 4. Insert; deadline computed by the database from its own clock. Conflicts → someone else won.
  const attemptNo = (await db.attempt.count({ where: { examId: exam.id, userId: actor.userId } })) + 1;
  const inserted = await db.$queryRaw<{ id: string; controller_token: string }[]>`
    INSERT INTO attempt (id, exam_id, exam_version_id, user_id, kind, attempt_no, status, started_at, deadline_at,
                         revision, controller_token, replaces_attempt_id, created_at)
    SELECT gen_random_uuid(), ${exam.id}::uuid, ${exam.currentVersionId}::uuid, ${actor.userId}, ${kind}::"AttemptKind", ${attemptNo},
           'IN_PROGRESS', ts, LEAST(ts + make_interval(secs => ${exam.durationSeconds}::int), ${exam.closesAt}::timestamptz),
           0, gen_random_uuid(), ${replacesAttemptId}::uuid, ts
    FROM (SELECT clock_timestamp() AS ts) c
    WHERE (${exam.closesAt}::timestamptz IS NULL OR c.ts < ${exam.closesAt}::timestamptz)
    ON CONFLICT DO NOTHING
    RETURNING id, controller_token::text AS controller_token`;
  const row = inserted[0];
  if (row) return { attemptId: row.id, status: "IN_PROGRESS", created: true, controllerToken: row.controller_token };

  const winner = await db.attempt.findFirst({
    where: { examId: exam.id, userId: actor.userId, OR: [{ status: "IN_PROGRESS" }, ...(kind === "OFFICIAL" ? [{ kind: "OFFICIAL" as const, voidedAt: null }] : [])] },
    select: { id: true, status: true },
  });
  if (!winner) throw new AppError("CLOSED", "This exam has closed.");
  // The concurrent creator holds the controller token; this request takes over only if asked.
  return winner.status === "IN_PROGRESS" ? resumeOrExpire(winner.id, actor.userId, opts.takeover) : { attemptId: winner.id, status: winner.status, created: false, controllerToken: null };
}

async function resumeOrExpire(attemptId: string, userId: string, takeover: boolean): Promise<StartResult> {
  return tx(async (t): Promise<StartResult> => {
    const a = await lockAttempt(t, attemptId, { userId });
    if (!a) throw new AppError("NOT_FOUND", "Attempt not found.");
    if (a.status === "IN_PROGRESS" && expired(a)) {
      await finalizeLocked(t, a, "EXPIRED");
      return { attemptId, status: "GRADED", created: false, controllerToken: null };
    }
    if (a.status !== "IN_PROGRESS") return { attemptId, status: a.status, created: false, controllerToken: null };
    const token = takeover ? await rotateController(t, attemptId) : null;
    return { attemptId, status: "IN_PROGRESS", created: false, controllerToken: token };
  });
}

const expired = (a: LockedAttempt) => a.deadline_at !== null && a.now.getTime() >= a.deadline_at.getTime();

async function rotateController(t: Tx, attemptId: string): Promise<string> {
  const r = await t.$queryRaw<{ token: string }[]>`UPDATE attempt SET controller_token = gen_random_uuid() WHERE id = ${attemptId}::uuid
    RETURNING controller_token::text AS token`;
  return r[0]!.token;
}

/* ───────────────────────── read ───────────────────────── */

/** Owner-only view; lazily finalises an expired attempt first so the student sees a coherent state. */
export async function getAttemptForStudent(actor: Actor, attemptId: string): Promise<AttemptView> {
  return tx(async (t) => {
    const a = await lockAttempt(t, attemptId, { userId: actor.userId });
    if (!a) throw new AppError("NOT_FOUND", "Attempt not found.");
    if (a.status === "IN_PROGRESS" && expired(a)) await finalizeLocked(t, a, "EXPIRED");
    const v = await buildAttemptView(t, attemptId, actor.userId);
    if (!v) throw new AppError("NOT_FOUND", "Attempt not found.");
    return v;
  });
}

/** Explicit takeover: this tab/device becomes the only writer; others receive CONTROLLER_CHANGED. */
export async function takeover(actor: Actor, attemptId: string): Promise<{ controllerToken: string; revision: number; answers: Record<string, string | null> }> {
  const out = await tx(async (t) => {
    const a = await lockAttempt(t, attemptId, { userId: actor.userId });
    if (!a) throw new AppError("NOT_FOUND", "Attempt not found.");
    if (a.status === "IN_PROGRESS" && expired(a)) {
      await finalizeLocked(t, a, "EXPIRED");
      return { finalized: true as const };
    }
    if (a.status !== "IN_PROGRESS" || a.voided_at) return { finalized: true as const };
    const token = await rotateController(t, attemptId);
    return { finalized: false as const, token, revision: a.revision, answers: await canonicalAnswers(t, attemptId) };
  });
  if (out.finalized) throw new AppError("ATTEMPT_FINALIZED", "This attempt has finished.", { attemptId });
  return { controllerToken: out.token, revision: out.revision, answers: out.answers };
}

async function canonicalAnswers(t: Tx, attemptId: string): Promise<Record<string, string | null>> {
  const rows = await t.attemptAnswer.findMany({ where: { attemptId }, select: { examQuestionId: true, optionId: true } });
  return Object.fromEntries(rows.map((r) => [r.examQuestionId, r.optionId]));
}

/* ───────────────────────── save ───────────────────────── */

export interface SaveAck {
  revision: number;
  savedAt: string;
  serverTime: string;
  deadlineAt: string | null;
  duplicate: boolean;
}

type Outcome<T> = { ok: T } | { err: AppError };

/**
 * Answer batch save with attempt-level compare-and-swap under the row lock (ADR-004).
 * Admission: server time under lock < deadline. Duplicate mutation → original ack.
 */
export async function saveAnswers(actor: Actor, attemptId: string, body: SaveBody): Promise<SaveAck> {
  const r: Outcome<SaveAck> = await tx(async (t) => {
    const a = await lockAttempt(t, attemptId, { userId: actor.userId });
    if (!a) return { err: new AppError("NOT_FOUND", "Attempt not found.") };
    if (a.last_mutation_id === body.mutationId && a.status === "IN_PROGRESS")
      return { ok: ack(a, a.revision, true) };
    const gate = await gateWrite(t, a, body.controllerToken, body.baseRevision);
    if (gate) return { err: gate };
    await applyChanges(t, a, body.changes);
    const rev = await bump(t, a, body.mutationId);
    return { ok: ack(a, rev, false) };
  });
  if ("err" in r) throw r.err;
  return r.ok;
}

function ack(a: LockedAttempt, revision: number, duplicate: boolean): SaveAck {
  return { revision, savedAt: a.now.toISOString(), serverTime: a.now.toISOString(), deadlineAt: a.deadline_at?.toISOString() ?? null, duplicate };
}

/**
 * Common write gate. Returns an error to throw AFTER commit (so a lazy expiry finalisation persists).
 * Order: finalised → deadline → controller → revision.
 */
async function gateWrite(t: Tx, a: LockedAttempt, token: string, baseRevision: number): Promise<AppError | null> {
  if (a.status !== "IN_PROGRESS" || a.voided_at) return new AppError("ATTEMPT_FINALIZED", "This attempt has finished.", { attemptId: a.id });
  if (expired(a)) {
    await finalizeLocked(t, a, "EXPIRED");
    return new AppError("ATTEMPT_FINALIZED", "Time is up. Your saved answers were submitted.", { attemptId: a.id, reason: "EXPIRED" });
  }
  if (a.controller_token !== token)
    return new AppError("CONTROLLER_CHANGED", "This exam is open in another tab or device.", { attemptId: a.id });
  if (a.revision !== baseRevision)
    return new AppError("REVISION_CONFLICT", "Your answers changed elsewhere.", { revision: a.revision, answers: await canonicalAnswers(t, a.id) });
  return null;
}

async function applyChanges(t: Tx, a: LockedAttempt, changes: SaveBody["changes"]): Promise<void> {
  if (changes.length === 0) return;
  const slots = await versionSlots(t, a.exam_version_id);
  const last = new Map<string, string | null>();
  for (const c of changes) last.set(c.examQuestionId, c.optionId);
  const qIds: string[] = [];
  const qvIds: string[] = [];
  const optIds: (string | null)[] = [];
  for (const [eqId, opt] of last) {
    const slot = slots.get(eqId);
    if (!slot) throw new AppError("INVALID_OPTION", "Question does not belong to this exam.", { examQuestionId: eqId });
    if (opt !== null && !slot.optionIds.has(opt)) throw new AppError("INVALID_OPTION", "Option does not belong to this question.", { examQuestionId: eqId });
    qIds.push(eqId);
    qvIds.push(slot.questionVersionId);
    optIds.push(opt);
  }
  const nextRev = a.revision + 1;
  await t.$executeRaw`
    INSERT INTO attempt_answer (attempt_id, exam_question_id, exam_version_id, question_version_id, option_id, revision, updated_at)
    SELECT ${a.id}::uuid, q, ${a.exam_version_id}::uuid, qv, o, ${nextRev}, ${a.now}::timestamptz
    FROM unnest(${qIds}::uuid[], ${qvIds}::uuid[], ${optIds}::uuid[]) AS x(q, qv, o)
    ON CONFLICT (attempt_id, exam_question_id) DO UPDATE SET option_id = EXCLUDED.option_id, revision = EXCLUDED.revision, updated_at = EXCLUDED.updated_at`;
}

async function bump(t: Tx, a: LockedAttempt, mutationId: string): Promise<number> {
  const r = await t.$queryRaw<{ revision: number }[]>`UPDATE attempt SET revision = revision + 1, last_mutation_id = ${mutationId}::uuid,
    last_saved_at = ${a.now}::timestamptz WHERE id = ${a.id}::uuid AND revision = ${a.revision} RETURNING revision`;
  if (!r[0]) throw new Error("revision CAS failed under lock (invariant violated)");
  return r[0].revision;
}

/* ───────────────────────── submit ───────────────────────── */

export interface SubmitOutcome {
  attemptId: string;
  appliedFinalChanges: boolean;
}

/**
 * Manual submission (R6.3). One short transaction; the lock serialises against saves and expiry.
 * Already finalised → canonical (idempotent). At/after deadline → EXPIRED with saved answers only.
 */
export async function submitAttempt(actor: Actor, attemptId: string, body: SubmitBody): Promise<SubmitOutcome> {
  const r: Outcome<SubmitOutcome> = await tx(async (t) => {
    const a = await lockAttempt(t, attemptId, { userId: actor.userId });
    if (!a) return { err: new AppError("NOT_FOUND", "Attempt not found.") };
    if (a.status !== "IN_PROGRESS") return { ok: { attemptId, appliedFinalChanges: false } };
    if (a.voided_at) return { err: new AppError("ATTEMPT_FINALIZED", "This attempt was voided.") };
    if (expired(a)) {
      await finalizeLocked(t, a, "EXPIRED");
      return { ok: { attemptId, appliedFinalChanges: false } };
    }
    const gate = await gateWrite(t, a, body.controllerToken, body.baseRevision);
    if (gate) return { err: gate };
    if (body.finalChanges.length) {
      await applyChanges(t, a, body.finalChanges);
      a.revision = await bump(t, a, body.mutationId);
    }
    await finalizeLocked(t, a, "MANUAL");
    return { ok: { attemptId, appliedFinalChanges: body.finalChanges.length > 0 } };
  });
  if ("err" in r) throw r.err;
  return r.ok;
}

/* ───────────────────────── expiry reconciliation ───────────────────────── */

/**
 * Finalise expired in-progress attempts using acknowledged answers only (R6.6). Bounded batches,
 * SKIP LOCKED so concurrent runners/requests never block or double-process.
 */
export async function finalizeExpired(maxTotal = 500, batch = 50): Promise<number> {
  let done = 0;
  while (done < maxTotal) {
    const n = await tx(async (t) => {
      const ids = await t.$queryRaw<{ id: string }[]>`SELECT id FROM attempt
        WHERE status = 'IN_PROGRESS' AND deadline_at IS NOT NULL AND deadline_at <= clock_timestamp()
        ORDER BY deadline_at LIMIT ${Math.min(batch, maxTotal - done)} FOR UPDATE SKIP LOCKED`;
      for (const { id } of ids) {
        const a = await lockAttempt(t, id);
        if (a && a.status === "IN_PROGRESS" && expired(a)) await finalizeLocked(t, a, "EXPIRED");
      }
      return ids.length;
    }, { timeoutMs: 20_000 });
    done += n;
    if (n === 0) break;
  }
  return done;
}

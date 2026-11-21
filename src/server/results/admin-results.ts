import "server-only";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";
import { db, tx } from "../db";
import { AppError } from "../http/app-error";
import { audit } from "../platform/audit";
import { enqueue } from "../platform/jobs";
import { csvSafeCell } from "../platform/csv-safe";
import type { Actor } from "../auth/actor";
import { verifyUserPassword } from "../auth/passwords";
import { gradeLocked, lockAttempt } from "../assessment/finalize";
import { rankingStatus } from "./leaderboard";
import { correctionBody, voidBody } from "./schemas";
export { correctionBody, voidBody };

export async function examStats(examId: string) {
  const r = await db.$queryRaw<{ started: number; in_progress: number; finalized: number; graded: number; voided: number; mean: number | null; max: number | null; min: number | null }[]>`
    SELECT COUNT(*)::int AS started,
      COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress,
      COUNT(*) FILTER (WHERE status <> 'IN_PROGRESS')::int AS finalized,
      COUNT(*) FILTER (WHERE status = 'GRADED' AND voided_at IS NULL)::int AS graded,
      COUNT(*) FILTER (WHERE voided_at IS NOT NULL)::int AS voided,
      AVG(score) FILTER (WHERE status = 'GRADED' AND voided_at IS NULL)::float AS mean,
      MAX(score) FILTER (WHERE status = 'GRADED' AND voided_at IS NULL) AS max,
      MIN(score) FILTER (WHERE status = 'GRADED' AND voided_at IS NULL) AS min
    FROM attempt WHERE exam_id = ${examId}::uuid AND kind = (SELECT CASE WHEN mode = 'RANKED' THEN 'OFFICIAL' ELSE 'PRACTICE' END FROM exam WHERE id = ${examId}::uuid)::"AttemptKind"`;
  return { ...r[0]!, ranking: await rankingStatus(examId) };
}

export async function listAttempts(examId: string, opts: { status?: "IN_PROGRESS" | "SUBMITTED" | "GRADED"; search?: string; page: number; pageSize: number }) {
  const where = {
    examId,
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.search ? { user: { profile: { OR: [{ epId: { contains: opts.search.toUpperCase() } }, { fullName: { contains: opts.search, mode: "insensitive" as const } }] } } } : {}),
  };
  const [total, items] = await Promise.all([
    db.attempt.count({ where }),
    db.attempt.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: {
        id: true, kind: true, attemptNo: true, status: true, startedAt: true, deadlineAt: true, submittedAt: true, finalizeReason: true, elapsedMs: true,
        revision: true, lastSavedAt: true, score: true, maxScore: true, voidedAt: true, voidReason: true, replacementGranted: true, replacesAttemptId: true,
        user: { select: { profile: { select: { epId: true, fullName: true } } } },
        _count: { select: { answers: true } },
      },
    }),
  ]);
  return { total, items };
}

/** Read model for the admin results screen header, grading history and key-correction form. */
export async function getResultsAdminView(examId: string) {
  const e = await db.exam.findUnique({
    where: { id: examId },
    select: {
      title: true, slug: true, mode: true, status: true, currentVersionId: true,
      currentVersion: { select: { latestGradingRevisionId: true, gradingRevisions: { orderBy: { revisionNo: "asc" }, select: { revisionNo: true, reason: true, createdAt: true } } } },
    },
  });
  if (!e?.currentVersionId || !e.currentVersion?.latestGradingRevisionId) return null;
  const [slots, keys] = await Promise.all([
    db.examQuestion.findMany({ where: { examVersionId: e.currentVersionId }, orderBy: { position: "asc" }, select: { id: true, position: true, questionVersion: { select: { stem: true, options: { orderBy: { position: "asc" }, select: { id: true, text: true } } } } } }),
    db.gradingKey.findMany({ where: { gradingRevisionId: e.currentVersion.latestGradingRevisionId }, select: { examQuestionId: true, correctOptionId: true } }),
  ]);
  const keyOf = new Map(keys.map((k) => [k.examQuestionId, k.correctOptionId]));
  return {
    title: e.title,
    slug: e.slug,
    mode: e.mode,
    status: e.status,
    gradingRevisions: e.currentVersion.gradingRevisions,
    correctionSlots: slots.map((s) => ({
      examQuestionId: s.id,
      position: s.position,
      stem: s.questionVersion.stem,
      correctOptionId: keyOf.get(s.id) ?? "",
      options: s.questionVersion.options.map((o, k) => ({ id: o.id, letter: "ABCD"[k] ?? "?", text: o.text })),
    })),
  };
}

/**
 * Results CSV export for ONE exam (R9.3). Keyset-paginated reads, hard cap, every untrusted text
 * cell neutralised against formula injection. Contains personal data: admin only.
 */
/** Audited export use case: builds the CSV and records who exported which exam. */
export async function exportResults(actor: Actor, examId: string, opts: { includeVoided: boolean }, requestId: string) {
  const csv = await exportResultsCsv(examId, opts);
  await audit({ actorId: actor.userId, action: "results.exported", targetType: "exam", targetId: examId, detail: { includeVoided: opts.includeVoided }, requestId });
  return { csv, fileName: `results-${examId.slice(0, 8)}.csv` };
}

export async function exportResultsCsv(examId: string, opts: { includeVoided: boolean }): Promise<string> {
  const exam = await db.exam.findUnique({ where: { id: examId }, select: { mode: true } });
  if (!exam) throw new AppError("NOT_FOUND", "Exam not found.");
  const kind = exam.mode === "RANKED" ? "OFFICIAL" : "PRACTICE";
  const rows: (string | number)[][] = [["rank", "ep_id", "full_name", "display_name", "grade", "school", "district", "attempt_no", "status", "score", "max_score", "percent", "elapsed_ms", "started_at_utc", "submitted_at_utc", "finalize_reason", "voided", "void_reason"]];
  const ranked = await db.$queryRaw<{ id: string; rank: bigint }[]>`
    SELECT a.id, RANK() OVER (ORDER BY a.score DESC, a.elapsed_ms ASC) AS rank
    FROM attempt a JOIN exam_version v ON v.id = a.exam_version_id
    WHERE a.exam_id = ${examId}::uuid AND a.kind = 'OFFICIAL' AND a.status = 'GRADED' AND a.voided_at IS NULL
      AND a.grading_revision_id = v.latest_grading_revision_id`;
  const rankOf = new Map(ranked.map((r) => [r.id, Number(r.rank)]));
  let cursor: string | undefined;
  const CAP = 20_000;
  for (;;) {
    const page = await db.attempt.findMany({
      where: { examId, kind, ...(opts.includeVoided ? {} : { voidedAt: null }) },
      orderBy: { id: "asc" },
      take: 1000,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, attemptNo: true, status: true, score: true, maxScore: true, percentBp: true, elapsedMs: true, startedAt: true, submittedAt: true, finalizeReason: true, voidedAt: true, voidReason: true,
        user: { select: { profile: { select: { epId: true, fullName: true, displayName: true, school: true, district: true, grade: { select: { level: true } } } } } },
      },
    });
    for (const a of page) {
      const p = a.user.profile;
      rows.push([
        rankOf.get(a.id) ?? "", p?.epId ?? "", p?.fullName ?? "", p?.displayName ?? "", p?.grade.level ?? "", p?.school ?? "", p?.district ?? "", a.attemptNo, a.status,
        a.score ?? "", a.maxScore ?? "", a.percentBp === null ? "" : (a.percentBp / 100).toFixed(2), a.elapsedMs ?? "", a.startedAt.toISOString(), a.submittedAt?.toISOString() ?? "",
        a.finalizeReason ?? "", a.voidedAt ? "yes" : "no", a.voidReason ?? "",
      ].map(csvSafeCell));
    }
    if (page.length < 1000 || rows.length > CAP) break;
    cursor = page[page.length - 1]!.id;
  }
  if (rows.length > CAP + 1) throw new AppError("CONFLICT", "Too many rows to export at once; filter the export.");
  rows.sort((x, y) => (Number(x[0]) || Infinity) - (Number(y[0]) || Infinity));
  return "\uFEFF" + stringify(rows, { record_delimiter: "\r\n" });
}


/** Void a finalised attempt with a reason (R5.3). Original record kept; optional single replacement. */
export async function voidAttempt(actor: Actor, attemptId: string, body: z.infer<typeof voidBody>, requestId: string) {
  if (!(await verifyUserPassword(actor.userId, body.adminPassword))) throw new AppError("ACCESS_DENIED", "Your password is incorrect.", { errors: [{ path: "adminPassword", message: "Incorrect password." }] });
  await tx(async (t) => {
    const a = await lockAttempt(t, attemptId);
    if (!a) throw new AppError("NOT_FOUND", "Attempt not found.");
    if (a.voided_at) throw new AppError("CONFLICT", "Attempt is already void.");
    if (a.status === "IN_PROGRESS") throw new AppError("CONFLICT", "Wait until the attempt is submitted or expires before voiding it.");
    await t.attempt.update({ where: { id: attemptId }, data: { voidedAt: new Date(), voidReason: body.reason, voidedById: actor.userId, replacementGranted: body.grantReplacement } });
    if (a.kind === "OFFICIAL") await bumpRankingRevision(t, a.exam_id, `An attempt was voided (${new Date().toISOString().slice(0, 10)}).`);
    await audit({ actorId: actor.userId, action: "attempt.voided", targetType: "attempt", targetId: attemptId, detail: { reason: body.reason, grantReplacement: body.grantReplacement }, requestId }, t);
  });
}

async function bumpRankingRevision(t: Parameters<Parameters<typeof tx>[0]>[0], examId: string, note: string) {
  await t.$executeRaw`UPDATE exam SET ranking_revision = ranking_revision + 1, ranking_note = ${note} WHERE id = ${examId}::uuid`;
}


/**
 * Grading correction (R8.3): new grading revision copied from the latest with the changed keys.
 * Published content and old revisions are untouched. A bounded job regrades existing results.
 */
export async function createGradingCorrection(actor: Actor, examId: string, body: z.infer<typeof correctionBody>, requestId: string) {
  if (!(await verifyUserPassword(actor.userId, body.adminPassword))) throw new AppError("ACCESS_DENIED", "Your password is incorrect.", { errors: [{ path: "adminPassword", message: "Incorrect password." }] });
  return tx(async (t) => {
    const e = await t.$queryRaw<{ current_version_id: string | null }[]>`SELECT current_version_id FROM exam WHERE id = ${examId}::uuid FOR UPDATE`;
    const versionId = e[0]?.current_version_id;
    if (!versionId) throw new AppError("CONFLICT", "Exam is not published.");
    const v = await t.examVersion.findUniqueOrThrow({ where: { id: versionId }, select: { latestGradingRevisionId: true } });
    const latest = await t.gradingRevision.findUniqueOrThrow({ where: { id: v.latestGradingRevisionId! }, select: { revisionNo: true, keys: true } });
    const slotOpts = await t.examQuestion.findMany({ where: { examVersionId: versionId }, select: { id: true, questionVersion: { select: { options: { select: { id: true } } } } } });
    const valid = new Map(slotOpts.map((s) => [s.id, new Set(s.questionVersion.options.map((o) => o.id))]));
    const changes = new Map(body.changes.map((c) => [c.examQuestionId, c.correctOptionId]));
    let effective = 0;
    for (const [q, o] of changes) {
      if (!valid.get(q)?.has(o)) throw new AppError("INVALID_OPTION", "Option does not belong to that question.", { examQuestionId: q });
      if (latest.keys.find((k) => k.examQuestionId === q)?.correctOptionId !== o) effective++;
    }
    if (!effective) throw new AppError("VALIDATION_ERROR", "No answer key actually changes.");
    const rev = await t.gradingRevision.create({ data: { examVersionId: versionId, revisionNo: latest.revisionNo + 1, reason: body.reason, createdById: actor.userId }, select: { id: true, revisionNo: true } });
    await t.gradingKey.createMany({
      data: latest.keys.map((k) => ({ gradingRevisionId: rev.id, examQuestionId: k.examQuestionId, examVersionId: k.examVersionId, questionVersionId: k.questionVersionId, correctOptionId: changes.get(k.examQuestionId) ?? k.correctOptionId, marks: k.marks })),
    });
    await t.examVersion.update({ where: { id: versionId }, data: { latestGradingRevisionId: rev.id } });
    await bumpRankingRevision(t, examId, `Answer key corrected (revision ${rev.revisionNo}): ${body.reason}`);
    await enqueue(t, "REGRADE_EXAM_VERSION", { examVersionId: versionId, gradingRevisionId: rev.id }, { dedupeKey: `regrade:${versionId}`, maxAttempts: 10 });
    await audit({ actorId: actor.userId, action: "grading.corrected", targetType: "exam", targetId: examId, detail: { revisionNo: rev.revisionNo, reason: body.reason, changed: effective }, requestId }, t);
    return { gradingRevisionId: rev.id, revisionNo: rev.revisionNo };
  });
}

/** Job handler: regrade up to `batch` stale attempts. Returns remaining count. Idempotent. */
export async function regradeBatch(examVersionId: string, batch = 200): Promise<number> {
  const ids = await db.$queryRaw<{ id: string }[]>`
    SELECT a.id FROM attempt a JOIN exam_version v ON v.id = a.exam_version_id
    WHERE a.exam_version_id = ${examVersionId}::uuid AND a.status IN ('GRADED', 'SUBMITTED')
      AND (a.grading_revision_id IS NULL OR a.grading_revision_id <> v.latest_grading_revision_id)
    ORDER BY a.id LIMIT ${batch}`;
  for (const { id } of ids) {
    await tx(async (t) => {
      const a = await lockAttempt(t, id, { skipLocked: true });
      if (a && a.status !== "IN_PROGRESS") await gradeLocked(t, a.id, a.exam_version_id); // times untouched
    });
  }
  const left = await db.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM attempt a JOIN exam_version v ON v.id = a.exam_version_id
    WHERE a.exam_version_id = ${examVersionId}::uuid AND a.status IN ('GRADED', 'SUBMITTED')
      AND (a.grading_revision_id IS NULL OR a.grading_revision_id <> v.latest_grading_revision_id)`;
  return left[0]?.n ?? 0;
}

/** Job handler: (re)grade one SUBMITTED attempt left ungraded by a grading fault. */
export async function gradeOne(attemptId: string): Promise<boolean> {
  return tx(async (t) => {
    const a = await lockAttempt(t, attemptId);
    if (!a || a.status === "IN_PROGRESS") return true;
    if (a.status === "GRADED") return true;
    return gradeLocked(t, a.id, a.exam_version_id);
  });
}

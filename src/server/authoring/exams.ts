import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db, tx } from "../db";
import { AppError } from "../http/app-error";
import { audit } from "../platform/audit";
import type { Actor } from "../auth/actor";
import { checkQuestionContent } from "./question-validation";
import { mediaFacts } from "./questions";
import { DEFAULT_RELEASE } from "../results/release-policy";
import { examSettingsSchema, type ExamSettings } from "./exam-schema";
export { examSettingsSchema, type ExamSettings };


export function defaultSettings(mode: "RANKED" | "PRACTICE") {
  return { durationMinutes: 60, ...DEFAULT_RELEASE[mode], leaderboardVisibility: "STUDENTS" as const, allowLateStart: true, maxAttempts: null };
}

function toData(s: ExamSettings) {
  return {
    title: s.title,
    description: s.description,
    instructions: s.instructions,
    gradeId: s.gradeId,
    subjectId: s.subjectId,
    teacherId: s.teacherId,
    coverMediaId: s.coverMediaId,
    mode: s.mode,
    durationSeconds: s.durationMinutes === null ? null : s.durationMinutes * 60,
    opensAt: s.opensAt ? new Date(s.opensAt) : null,
    closesAt: s.closesAt ? new Date(s.closesAt) : null,
    allowLateStart: s.allowLateStart,
    maxAttempts: s.mode === "PRACTICE" ? s.maxAttempts : null,
    scoreVisibility: s.scoreVisibility,
    correctnessVisibility: s.correctnessVisibility,
    answerVisibility: s.answerVisibility,
    explanationVisibility: s.explanationVisibility,
    reviewReleaseAt: s.reviewReleaseAt ? new Date(s.reviewReleaseAt) : null,
    leaderboardVisibility: s.mode === "RANKED" ? s.leaderboardVisibility : ("HIDDEN" as const),
  };
}

export function makeSlug(title: string): string {
  const base = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "exam"}-${randomBytes(3).toString("hex")}`;
}

export async function createExam(actor: Actor, s: ExamSettings, requestId: string) {
  return tx(async (t) => {
    const e = await t.exam.create({ data: { ...toData(s), slug: makeSlug(s.title), createdById: actor.userId }, select: { id: true, slug: true } });
    await audit({ actorId: actor.userId, action: "exam.created", targetType: "exam", targetId: e.id, requestId }, t);
    return e;
  });
}

/**
 * Settings are editable while DRAFT. After publication only schedule/release/visibility may change
 * and the paper itself never changes (different paper ⇒ duplicate).
 */
export async function updateExam(actor: Actor, examId: string, s: ExamSettings, requestId: string) {
  return tx(async (t) => {
    const cur = await t.exam.findUnique({ where: { id: examId }, select: { status: true, mode: true, gradeId: true, subjectId: true, durationSeconds: true } });
    if (!cur) throw new AppError("NOT_FOUND", "Exam not found.");
    if (cur.status === "ARCHIVED") throw new AppError("CONFLICT", "Archived exams cannot be edited.");
    const data = toData(s);
    if (cur.status === "PUBLISHED") {
      const attempts = await t.attempt.count({ where: { examId } });
      if (cur.mode !== data.mode || cur.gradeId !== data.gradeId || cur.subjectId !== data.subjectId)
        throw new AppError("CONFLICT", "Mode, grade and subject cannot change after publication. Duplicate the exam instead.");
      if (attempts > 0 && cur.durationSeconds !== data.durationSeconds)
        throw new AppError("CONFLICT", "Duration cannot change after students have started. Duplicate the exam instead.");
    }
    await t.exam.update({ where: { id: examId }, data });
    await audit({ actorId: actor.userId, action: "exam.updated", targetType: "exam", targetId: examId, detail: { status: cur.status }, requestId }, t);
  });
}

export async function setDraftItems(actor: Actor, examId: string, questionVersionIds: string[], requestId: string) {
  if (new Set(questionVersionIds).size !== questionVersionIds.length) throw new AppError("VALIDATION_ERROR", "A question appears twice.");
  if (questionVersionIds.length > 500) throw new AppError("VALIDATION_ERROR", "Too many questions (max 500).");
  return tx(async (t) => {
    const e = await t.exam.findUnique({ where: { id: examId }, select: { status: true } });
    if (!e) throw new AppError("NOT_FOUND", "Exam not found.");
    if (e.status !== "DRAFT") throw new AppError("CONFLICT", "Questions can only be changed while the exam is a draft.");
    const found = await t.questionVersion.count({ where: { id: { in: questionVersionIds } } });
    if (found !== questionVersionIds.length) throw new AppError("VALIDATION_ERROR", "Unknown question version.");
    await t.examDraftItem.deleteMany({ where: { examId } });
    if (questionVersionIds.length)
      await t.examDraftItem.createMany({ data: questionVersionIds.map((id, i) => ({ examId, position: i, questionVersionId: id })) });
    await audit({ actorId: actor.userId, action: "exam.questions_set", targetType: "exam", targetId: examId, detail: { count: questionVersionIds.length }, requestId }, t);
  });
}

export interface PublishIssue {
  position: number | null;
  message: string;
}

/** Pre-publication validation (also shown in preview). */
export async function publishIssues(examId: string): Promise<PublishIssue[]> {
  const e = await db.exam.findUnique({
    where: { id: examId },
    select: {
      mode: true,
      closesAt: true,
      opensAt: true,
      durationSeconds: true,
      draftItems: {
        orderBy: { position: "asc" },
        select: {
          position: true,
          questionVersion: { select: { stem: true, stemMediaId: true, marks: true, explanation: true, options: { orderBy: { position: "asc" }, select: { text: true, mediaId: true, isCorrect: true } } } },
        },
      },
    },
  });
  if (!e) throw new AppError("NOT_FOUND", "Exam not found.");
  const issues: PublishIssue[] = [];
  if (e.draftItems.length === 0) issues.push({ position: null, message: "Add at least one question." });
  if (e.mode === "RANKED" && (!e.closesAt || e.durationSeconds === null)) issues.push({ position: null, message: "Ranked exams need a close time and a duration." });
  if (e.closesAt && e.closesAt.getTime() <= Date.now()) issues.push({ position: null, message: "The close time is in the past." });
  const ids = e.draftItems.flatMap((d) => [d.questionVersion.stemMediaId, ...d.questionVersion.options.map((o) => o.mediaId)]).filter((x): x is string => !!x);
  const media = await db.$transaction((t) => mediaFacts(t, ids));
  for (const d of e.draftItems) {
    const qv = d.questionVersion;
    const correct = qv.options.findIndex((o) => o.isCorrect);
    if (qv.options.length !== 4 || correct < 0) issues.push({ position: d.position, message: "Question must have four options and one correct answer." });
    const content = checkQuestionContent(
      { stem: qv.stem, stemMediaId: qv.stemMediaId, options: qv.options.map((o) => ({ text: o.text, mediaId: o.mediaId })), correctIndex: Math.max(correct, 0), marks: qv.marks, explanation: qv.explanation },
      media,
    );
    for (const c of content.filter((x) => x.severity === "error")) issues.push({ position: d.position, message: c.message });
  }
  return issues;
}

/**
 * Publish: freeze the draft into an immutable exam version with grading revision 1 (R3.5).
 * Single transaction; the exam row is locked so concurrent publishes cannot create two versions.
 */
export async function publishExam(actor: Actor, examId: string, requestId: string) {
  const issues = await publishIssues(examId);
  if (issues.length) throw new AppError("VALIDATION_ERROR", "The exam cannot be published yet.", { issues });
  return tx(async (t) => {
    const locked = await t.$queryRaw<{ status: string }[]>`SELECT status FROM exam WHERE id = ${examId}::uuid FOR UPDATE`;
    if (!locked[0]) throw new AppError("NOT_FOUND", "Exam not found.");
    if (locked[0].status !== "DRAFT") throw new AppError("CONFLICT", "Only draft exams can be published.");
    const items = await t.examDraftItem.findMany({
      where: { examId },
      orderBy: { position: "asc" },
      select: { position: true, questionVersionId: true, questionVersion: { select: { marks: true, options: { where: { isCorrect: true }, select: { id: true } } } } },
    });
    const prev = await t.examVersion.aggregate({ where: { examId }, _max: { versionNo: true } });
    const total = items.reduce((s, i) => s + i.questionVersion.marks, 0);
    const version = await t.examVersion.create({
      data: { examId, versionNo: (prev._max.versionNo ?? 0) + 1, totalMarks: total, questionCount: items.length, publishedById: actor.userId },
      select: { id: true },
    });
    const slots = await Promise.all(
      items.map((i, idx) =>
        t.examQuestion.create({
          data: { examVersionId: version.id, position: idx, questionVersionId: i.questionVersionId, marks: i.questionVersion.marks },
          select: { id: true, questionVersionId: true, marks: true },
        }),
      ),
    );
    const rev = await t.gradingRevision.create({ data: { examVersionId: version.id, revisionNo: 1, reason: "Initial publication", createdById: actor.userId }, select: { id: true } });
    await t.gradingKey.createMany({
      data: slots.map((s, idx) => ({
        gradingRevisionId: rev.id,
        examQuestionId: s.id,
        examVersionId: version.id,
        questionVersionId: s.questionVersionId,
        correctOptionId: items[idx]!.questionVersion.options[0]!.id,
        marks: s.marks,
      })),
    });
    await t.examVersion.update({ where: { id: version.id }, data: { latestGradingRevisionId: rev.id } });
    await t.exam.update({ where: { id: examId }, data: { status: "PUBLISHED", currentVersionId: version.id, publishedAt: new Date() } });
    await audit({ actorId: actor.userId, action: "exam.published", targetType: "exam", targetId: examId, detail: { versionId: version.id, questions: items.length, totalMarks: total }, requestId }, t);
    return { versionId: version.id };
  });
}

/** Unpublish back to draft — only when nobody has started (keeps history consistent). */
export async function unpublishExam(actor: Actor, examId: string, requestId: string) {
  return tx(async (t) => {
    await t.$queryRaw`SELECT id FROM exam WHERE id = ${examId}::uuid FOR UPDATE`;
    const e = await t.exam.findUnique({ where: { id: examId }, select: { status: true } });
    if (e?.status !== "PUBLISHED") throw new AppError("CONFLICT", "Only published exams can be unpublished.");
    if ((await t.attempt.count({ where: { examId } })) > 0) throw new AppError("CONFLICT", "Students have already started this exam. Archive or duplicate it instead.");
    await t.exam.update({ where: { id: examId }, data: { status: "DRAFT", currentVersionId: null, publishedAt: null } });
    await audit({ actorId: actor.userId, action: "exam.unpublished", targetType: "exam", targetId: examId, requestId }, t);
  });
}

export async function archiveExam(actor: Actor, examId: string, requestId: string) {
  return tx(async (t) => {
    const e = await t.exam.findUnique({ where: { id: examId }, select: { status: true } });
    if (!e) throw new AppError("NOT_FOUND", "Exam not found.");
    if (e.status === "ARCHIVED") return;
    // Draft exams have no version; archived drafts must still satisfy exam_published_has_version.
    if (e.status === "DRAFT") throw new AppError("CONFLICT", "Draft exams cannot be archived; publish or leave as draft.");
    await t.exam.update({ where: { id: examId }, data: { status: "ARCHIVED" } });
    await audit({ actorId: actor.userId, action: "exam.archived", targetType: "exam", targetId: examId, requestId }, t);
  });
}

export type ExamCommand = "publish" | "unpublish" | "archive" | "duplicate";

/** Dispatch one lifecycle command; returns a small typed result for the API. */
export async function runExamCommand(actor: Actor, examId: string, command: ExamCommand, requestId: string): Promise<{ ok: true; id?: string; versionId?: string }> {
  switch (command) {
    case "publish":
      return { ok: true, ...(await publishExam(actor, examId, requestId)) };
    case "unpublish":
      await unpublishExam(actor, examId, requestId);
      return { ok: true };
    case "archive":
      await archiveExam(actor, examId, requestId);
      return { ok: true };
    case "duplicate":
      return { ok: true, id: (await duplicateExam(actor, examId, requestId)).id };
  }
}

/** Duplicate = new exam id (new leaderboard) with the same settings and question versions as a draft. */
export async function duplicateExam(actor: Actor, examId: string, requestId: string) {
  return tx(async (t) => {
    const src = await t.exam.findUnique({ where: { id: examId }, include: { draftItems: true, currentVersion: { include: { questions: { orderBy: { position: "asc" } } } } } });
    if (!src) throw new AppError("NOT_FOUND", "Exam not found.");
    const qvIds = src.currentVersion ? src.currentVersion.questions.map((q) => q.questionVersionId) : src.draftItems.sort((a, b) => a.position - b.position).map((d) => d.questionVersionId);
    const data: Prisma.ExamUncheckedCreateInput = {
      slug: makeSlug(src.title),
      title: `${src.title} (copy)`.slice(0, 200),
      description: src.description,
      instructions: src.instructions,
      gradeId: src.gradeId,
      subjectId: src.subjectId,
      teacherId: src.teacherId,
      coverMediaId: src.coverMediaId,
      mode: src.mode,
      durationSeconds: src.durationSeconds,
      opensAt: null,
      closesAt: null,
      allowLateStart: src.allowLateStart,
      maxAttempts: src.maxAttempts,
      scoreVisibility: src.scoreVisibility,
      correctnessVisibility: src.correctnessVisibility,
      answerVisibility: src.answerVisibility,
      explanationVisibility: src.explanationVisibility,
      leaderboardVisibility: src.leaderboardVisibility,
      createdById: actor.userId,
    };
    const e = await t.exam.create({ data, select: { id: true, slug: true } });
    if (qvIds.length) await t.examDraftItem.createMany({ data: qvIds.map((id, i) => ({ examId: e.id, position: i, questionVersionId: id })) });
    await audit({ actorId: actor.userId, action: "exam.duplicated", targetType: "exam", targetId: e.id, detail: { from: examId }, requestId }, t);
    return e;
  });
}

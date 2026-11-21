import "server-only";
import { db, tx, type Tx } from "../db";
import { AppError } from "../http/app-error";
import { audit } from "../platform/audit";
import type { Actor } from "../auth/actor";
import { checkQuestionContent, questionInputSchema, type MediaFact, type QuestionInput } from "./question-validation";

export { questionInputSchema };

export async function mediaFacts(t: Tx, ids: Iterable<string>): Promise<Map<string, MediaFact>> {
  const list = [...new Set(ids)];
  if (!list.length) return new Map();
  const rows = await t.media.findMany({ where: { id: { in: list } }, select: { id: true, kind: true, altText: true } });
  return new Map(rows.map((r) => [r.id, { kind: r.kind, altText: r.altText }]));
}

export function mediaIdsOf(q: QuestionInput): string[] {
  return [q.stemMediaId, ...q.options.map((o) => o.mediaId)].filter((x): x is string => !!x);
}

/** Validate shape + content; throws VALIDATION_ERROR with field paths on errors. Returns warnings. */
export async function validateQuestion(t: Tx, q: QuestionInput): Promise<string[]> {
  const issues = checkQuestionContent(q, await mediaFacts(t, mediaIdsOf(q)));
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length)
    throw new AppError("VALIDATION_ERROR", "The question has errors.", { errors: errors.map((e) => ({ path: e.field, message: e.message })) });
  return issues.filter((i) => i.severity === "warning").map((i) => i.message);
}

/** Insert a question version + its four options. Caller validated. */
export async function insertVersion(t: Tx, questionId: string, versionNo: number, q: QuestionInput, actorId: string): Promise<string> {
  const v = await t.questionVersion.create({
    data: {
      questionId,
      versionNo,
      stem: q.stem,
      stemMediaId: q.stemMediaId ?? null,
      explanation: q.explanation ?? null,
      marks: q.marks,
      topic: q.topic ?? null,
      difficulty: q.difficulty ?? null,
      createdById: actorId,
      options: {
        create: q.options.map((o, i) => ({ position: i, text: o.text?.trim() ? o.text : null, mediaId: o.mediaId ?? null, isCorrect: i === q.correctIndex })),
      },
    },
    select: { id: true },
  });
  return v.id;
}

export interface CreatedQuestion {
  questionId: string;
  versionId: string;
  warnings: string[];
}

/** Create a bank question; optionally append it to a DRAFT exam in the same transaction. */
export async function createQuestion(
  actor: Actor,
  q: QuestionInput,
  externalId: string | null,
  requestId: string,
  opts: { addToExamId?: string | null } = {},
): Promise<CreatedQuestion> {
  return tx(async (t) => {
    if (opts.addToExamId) {
      const locked = await t.$queryRaw<{ status: string }[]>`SELECT status FROM exam WHERE id = ${opts.addToExamId}::uuid FOR UPDATE`;
      if (!locked[0]) throw new AppError("NOT_FOUND", "Exam not found.");
      if (locked[0].status !== "DRAFT") throw new AppError("CONFLICT", "Questions can only be added to a draft exam.");
    }
    const warnings = await validateQuestion(t, q);
    const question = await t.question.create({ data: { createdById: actor.userId, externalId }, select: { id: true } });
    const versionId = await insertVersion(t, question.id, 1, q, actor.userId);
    if (opts.addToExamId) {
      const max = await t.examDraftItem.aggregate({ where: { examId: opts.addToExamId }, _max: { position: true } });
      await t.examDraftItem.create({ data: { examId: opts.addToExamId, position: (max._max.position ?? -1) + 1, questionVersionId: versionId } });
    }
    await audit({ actorId: actor.userId, action: "question.created", targetType: "question", targetId: question.id, detail: { addToExamId: opts.addToExamId ?? null }, requestId }, t);
    return { questionId: question.id, versionId, warnings };
  });
}

/**
 * Edit = new version (R3.6). Draft exams referencing the previous version are moved to the new
 * one; published exam versions keep pointing at the old immutable version.
 */
export async function updateQuestion(actor: Actor, questionId: string, q: QuestionInput, requestId: string) {
  return tx(async (t) => {
    const latest = await t.questionVersion.findFirst({ where: { questionId }, orderBy: { versionNo: "desc" }, select: { id: true, versionNo: true } });
    if (!latest) throw new AppError("NOT_FOUND", "Question not found.");
    const warnings = await validateQuestion(t, q);
    const versionId = await insertVersion(t, questionId, latest.versionNo + 1, q, actor.userId);
    await t.$executeRaw`UPDATE exam_draft_item d SET question_version_id = ${versionId}::uuid
      FROM exam e WHERE d.exam_id = e.id AND e.status = 'DRAFT' AND d.question_version_id = ${latest.id}::uuid`;
    await audit({ actorId: actor.userId, action: "question.versioned", targetType: "question", targetId: questionId, detail: { versionNo: latest.versionNo + 1 }, requestId }, t);
    return { questionId, versionId, warnings };
  });
}

export interface QuestionListItem {
  id: string;
  externalId: string | null;
  versionId: string;
  versionNo: number;
  stem: string;
  marks: number;
  topic: string | null;
  usedInPublished: number;
}

export async function listQuestions(opts: { search?: string; page: number; pageSize: number }): Promise<{ total: number; items: QuestionListItem[] }> {
  const where = {
    archived: false,
    ...(opts.search
      ? { OR: [{ externalId: { contains: opts.search, mode: "insensitive" as const } }, { versions: { some: { stem: { contains: opts.search, mode: "insensitive" as const } } } }] }
      : {}),
  };
  const [total, rows] = await Promise.all([
    db.question.count({ where }),
    db.question.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: {
        id: true,
        externalId: true,
        versions: { orderBy: { versionNo: "desc" }, take: 1, select: { id: true, versionNo: true, stem: true, marks: true, topic: true, _count: { select: { examSlots: true } } } },
      },
    }),
  ]);
  return {
    total,
    items: rows.flatMap((r) => {
      const v = r.versions[0];
      return v ? [{ id: r.id, externalId: r.externalId, versionId: v.id, versionNo: v.versionNo, stem: v.stem, marks: v.marks, topic: v.topic, usedInPublished: v._count.examSlots }] : [];
    }),
  };
}

/** Full editable content of the latest version (admin only; includes the correct option). */
export async function getQuestionForEdit(questionId: string) {
  const v = await db.questionVersion.findFirst({
    where: { questionId },
    orderBy: { versionNo: "desc" },
    select: {
      id: true,
      versionNo: true,
      stem: true,
      stemMediaId: true,
      explanation: true,
      marks: true,
      topic: true,
      difficulty: true,
      question: { select: { externalId: true } },
      options: { orderBy: { position: "asc" }, select: { text: true, mediaId: true, isCorrect: true } },
    },
  });
  if (!v) throw new AppError("NOT_FOUND", "Question not found.");
  const input: QuestionInput = {
    stem: v.stem,
    stemMediaId: v.stemMediaId,
    options: v.options.map((o) => ({ text: o.text, mediaId: o.mediaId })),
    correctIndex: v.options.findIndex((o) => o.isCorrect),
    marks: v.marks,
    explanation: v.explanation,
    topic: v.topic,
    difficulty: v.difficulty,
  };
  return { questionId, versionId: v.id, versionNo: v.versionNo, externalId: v.question.externalId, input };
}

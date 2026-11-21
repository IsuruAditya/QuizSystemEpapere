import "server-only";
import type { Tx } from "../db";

/**
 * Student-safe DTOs. Built from explicit selects; never includes is_correct, grading keys or
 * explanations (R6.1). Shared by the student attempt page and the admin preview.
 */
import type { AttemptView, QuestionView } from "@/lib/attempt/types";
export type { AttemptView, MediaRef, OptionView, QuestionView } from "@/lib/attempt/types";

const mediaSelect = { id: true, altText: true, width: true, height: true } as const;

export async function loadVersionQuestions(t: Tx, examVersionId: string): Promise<QuestionView[]> {
  const slots = await t.examQuestion.findMany({
    where: { examVersionId },
    orderBy: { position: "asc" },
    select: {
      id: true,
      position: true,
      marks: true,
      questionVersion: {
        select: {
          stem: true,
          stemMediaId: true,
          options: { orderBy: { position: "asc" }, select: { id: true, position: true, text: true, mediaId: true } },
        },
      },
    },
  });
  const mediaIds = new Set<string>();
  for (const s of slots) {
    if (s.questionVersion.stemMediaId) mediaIds.add(s.questionVersion.stemMediaId);
    for (const o of s.questionVersion.options) if (o.mediaId) mediaIds.add(o.mediaId);
  }
  const media = new Map(
    (mediaIds.size ? await t.media.findMany({ where: { id: { in: [...mediaIds] } }, select: mediaSelect }) : []).map((m) => [
      m.id,
      { id: m.id, alt: m.altText, width: m.width, height: m.height },
    ]),
  );
  return slots.map((s) => ({
    examQuestionId: s.id,
    position: s.position,
    marks: s.marks,
    stem: s.questionVersion.stem,
    media: s.questionVersion.stemMediaId ? (media.get(s.questionVersion.stemMediaId) ?? null) : null,
    options: s.questionVersion.options.map((o) => ({
      id: o.id,
      position: o.position,
      text: o.text,
      media: o.mediaId ? (media.get(o.mediaId) ?? null) : null,
    })),
  }));
}

export async function buildAttemptView(t: Tx, attemptId: string, userId: string): Promise<AttemptView | null> {
  const a = await t.attempt.findFirst({
    where: { id: attemptId, userId },
    select: {
      id: true,
      kind: true,
      status: true,
      voidedAt: true,
      startedAt: true,
      deadlineAt: true,
      revision: true,
      lastSavedAt: true,
      examVersionId: true,
      examVersion: { select: { totalMarks: true } },
      exam: { select: { id: true, slug: true, title: true, mode: true, teacher: { select: { name: true, photoMediaId: true } } } },
      answers: { select: { examQuestionId: true, optionId: true } },
    },
  });
  if (!a) return null;
  const [{ now }] = (await t.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`) as [{ now: Date }];
  return {
    id: a.id,
    exam: {
      id: a.exam.id,
      slug: a.exam.slug,
      title: a.exam.title,
      mode: a.exam.mode,
      teacherName: a.exam.teacher?.name ?? null,
      teacherPhotoId: a.exam.teacher?.photoMediaId ?? null,
    },
    kind: a.kind,
    status: a.status,
    voided: a.voidedAt !== null,
    startedAt: a.startedAt.toISOString(),
    deadlineAt: a.deadlineAt?.toISOString() ?? null,
    serverTime: now.toISOString(),
    revision: a.revision,
    lastSavedAt: a.lastSavedAt?.toISOString() ?? null,
    totalMarks: a.examVersion.totalMarks,
    questions: a.status === "IN_PROGRESS" ? await loadVersionQuestions(t, a.examVersionId) : [],
    answers: Object.fromEntries(a.answers.map((x) => [x.examQuestionId, x.optionId])),
  };
}

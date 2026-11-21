import "server-only";
import { db } from "../db";
import { env } from "../env";
import { publishIssues, type PublishIssue } from "./exams";

/** Read models for admin exam screens (pages render these; they never query the DB themselves). */

export interface DraftItemView {
  questionId: string;
  versionId: string;
  stem: string;
  marks: number;
  externalId: string | null;
}

export async function getExamSummary(examId: string) {
  return db.exam.findUnique({ where: { id: examId }, select: { title: true, status: true } });
}

export async function getExamForEditor(examId: string) {
  const e = await db.exam.findUnique({
    where: { id: examId },
    include: {
      draftItems: { orderBy: { position: "asc" }, include: { questionVersion: { select: { id: true, stem: true, marks: true, questionId: true, question: { select: { externalId: true } } } } } },
      currentVersion: { select: { versionNo: true, questionCount: true, totalMarks: true } },
      _count: { select: { attempts: true } },
    },
  });
  if (!e) return null;
  const issues: PublishIssue[] = e.status === "DRAFT" ? await publishIssues(examId) : [];
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return {
    id: e.id,
    title: e.title,
    status: e.status,
    mode: e.mode,
    attemptCount: e._count.attempts,
    shareLink: `${env().APP_ORIGIN}/exams/${e.slug}`,
    version: e.currentVersion,
    issues,
    draftItems: e.draftItems.map(
      (d): DraftItemView => ({ questionId: d.questionVersion.questionId, versionId: d.questionVersion.id, stem: d.questionVersion.stem, marks: d.questionVersion.marks, externalId: d.questionVersion.question.externalId }),
    ),
    settings: {
      title: e.title,
      description: e.description,
      instructions: e.instructions,
      gradeId: e.gradeId,
      subjectId: e.subjectId,
      teacherId: e.teacherId,
      coverMediaId: e.coverMediaId,
      mode: e.mode,
      durationMinutes: e.durationSeconds === null ? null : Math.round(e.durationSeconds / 60),
      opensAt: iso(e.opensAt),
      closesAt: iso(e.closesAt),
      allowLateStart: e.allowLateStart,
      maxAttempts: e.maxAttempts,
      scoreVisibility: e.scoreVisibility,
      correctnessVisibility: e.correctnessVisibility,
      answerVisibility: e.answerVisibility,
      explanationVisibility: e.explanationVisibility,
      reviewReleaseAt: iso(e.reviewReleaseAt),
      leaderboardVisibility: e.leaderboardVisibility,
    },
  };
}

export interface PreviewQuestion {
  id: string;
  stem: string;
  stemMedia: { id: string; alt: string | null } | null;
  explanation: string | null;
  marks: number;
  options: { id: string; text: string | null; media: { id: string; alt: string | null } | null; isCorrect: boolean }[];
}

/** Admin preview of a draft or the published version, INCLUDING the answer key (admin only). */
export async function getExamPreview(examId: string): Promise<{ title: string; questions: PreviewQuestion[] } | null> {
  const e = await db.exam.findUnique({ where: { id: examId }, select: { title: true, currentVersionId: true } });
  if (!e) return null;
  const qvSelect = { id: true, stem: true, stemMediaId: true, explanation: true, marks: true, options: { orderBy: { position: "asc" as const }, select: { id: true, text: true, mediaId: true, isCorrect: true } } };
  const raw = e.currentVersionId
    ? (await db.examQuestion.findMany({ where: { examVersionId: e.currentVersionId }, orderBy: { position: "asc" }, select: { marks: true, questionVersion: { select: qvSelect } } })).map((s) => ({ ...s.questionVersion, marks: s.marks }))
    : (await db.examDraftItem.findMany({ where: { examId }, orderBy: { position: "asc" }, select: { questionVersion: { select: qvSelect } } })).map((d) => d.questionVersion);
  const ids = raw.flatMap((q) => [q.stemMediaId, ...q.options.map((o) => o.mediaId)]).filter((x): x is string => !!x);
  const alt = new Map((ids.length ? await db.media.findMany({ where: { id: { in: ids } }, select: { id: true, altText: true } }) : []).map((m) => [m.id, m.altText]));
  const ref = (id: string | null) => (id ? { id, alt: alt.get(id) ?? null } : null);
  return {
    title: e.title,
    questions: raw.map((q) => ({
      id: q.id,
      stem: q.stem,
      stemMedia: ref(q.stemMediaId),
      explanation: q.explanation,
      marks: q.marks,
      options: q.options.map((o) => ({ id: o.id, text: o.text, media: ref(o.mediaId), isCorrect: o.isCorrect })),
    })),
  };
}

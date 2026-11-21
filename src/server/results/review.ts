import "server-only";
import { db } from "../db";
import { AppError } from "../http/app-error";
import { releaseState, type ReleaseState } from "./release-policy";
import { loadVersionQuestions, type QuestionView } from "../assessment/attempt-view";

export interface ResultQuestion extends QuestionView {
  selectedOptionId: string | null;
  /** Present only when correctness is released. */
  correct?: boolean;
  awarded?: number;
  /** Present only when the correct answer is released. */
  correctOptionId?: string;
  /** Present only when explanations are released. */
  explanation?: string | null;
}

export interface ResultView {
  attemptId: string;
  exam: { id: string; slug: string; title: string; mode: "RANKED" | "PRACTICE" };
  kind: "OFFICIAL" | "PRACTICE";
  status: "IN_PROGRESS" | "SUBMITTED" | "GRADED";
  voided: boolean;
  voidReason: string | null;
  submittedAt: string | null;
  finalizeReason: "MANUAL" | "EXPIRED" | null;
  elapsedMs: number | null;
  /** null = hidden by policy OR not graded yet; see `gradingState`. */
  score: number | null;
  maxScore: number | null;
  percentBp: number | null;
  gradingState: "PENDING" | "GRADED";
  release: Omit<ReleaseState, "releaseAt"> & { releaseAt: string | null };
  questions: ResultQuestion[];
  serverTime: string;
}

/**
 * Student result/receipt with server-enforced release policy (R8.1). Detailed fields are added
 * only when permitted; otherwise they are absent from the payload (not merely hidden in the UI).
 */
export async function getResultForStudent(userId: string, attemptId: string): Promise<ResultView> {
  const a = await db.attempt.findFirst({
    where: { id: attemptId, userId },
    select: {
      id: true,
      kind: true,
      status: true,
      voidedAt: true,
      voidReason: true,
      submittedAt: true,
      finalizeReason: true,
      elapsedMs: true,
      score: true,
      maxScore: true,
      percentBp: true,
      examVersionId: true,
      gradingRevisionId: true,
      exam: {
        select: {
          id: true,
          slug: true,
          title: true,
          mode: true,
          closesAt: true,
          reviewReleaseAt: true,
          scoreVisibility: true,
          correctnessVisibility: true,
          answerVisibility: true,
          explanationVisibility: true,
        },
      },
    },
  });
  if (!a) throw new AppError("NOT_FOUND", "Result not found.");
  const [{ now }] = (await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`) as [{ now: Date }];
  const rel = releaseState(a.exam, now);
  const graded = a.status === "GRADED";
  const view: ResultView = {
    attemptId: a.id,
    exam: { id: a.exam.id, slug: a.exam.slug, title: a.exam.title, mode: a.exam.mode },
    kind: a.kind,
    status: a.status,
    voided: a.voidedAt !== null,
    voidReason: a.voidReason,
    submittedAt: a.submittedAt?.toISOString() ?? null,
    finalizeReason: a.finalizeReason,
    elapsedMs: a.elapsedMs,
    score: graded && rel.score ? a.score : null,
    maxScore: graded && rel.score ? a.maxScore : null,
    percentBp: graded && rel.score ? a.percentBp : null,
    gradingState: graded ? "GRADED" : "PENDING",
    release: { score: rel.score, correctness: rel.correctness, correctAnswer: rel.correctAnswer, explanation: rel.explanation, releaseAt: rel.releaseAt?.toISOString() ?? null },
    questions: [],
    serverTime: now.toISOString(),
  };
  if (a.status === "IN_PROGRESS" || !graded || !rel.correctness) return view;

  const [questions, answers, keys] = await Promise.all([
    db.$transaction((t) => loadVersionQuestions(t, a.examVersionId)),
    db.attemptAnswer.findMany({ where: { attemptId }, select: { examQuestionId: true, optionId: true } }),
    db.gradingKey.findMany({ where: { gradingRevisionId: a.gradingRevisionId! }, select: { examQuestionId: true, correctOptionId: true, marks: true } }),
  ]);
  const sel = new Map(answers.map((x) => [x.examQuestionId, x.optionId]));
  const key = new Map(keys.map((k) => [k.examQuestionId, k]));
  const explanations = rel.explanation
    ? new Map(
        (
          await db.examQuestion.findMany({ where: { examVersionId: a.examVersionId }, select: { id: true, questionVersion: { select: { explanation: true } } } })
        ).map((q) => [q.id, q.questionVersion.explanation]),
      )
    : null;
  view.questions = questions.map((q) => {
    const k = key.get(q.examQuestionId)!;
    const selected = sel.get(q.examQuestionId) ?? null;
    const correct = selected !== null && selected === k.correctOptionId;
    const out: ResultQuestion = { ...q, selectedOptionId: selected, correct, awarded: correct ? k.marks : 0, marks: k.marks };
    if (rel.correctAnswer) out.correctOptionId = k.correctOptionId;
    if (explanations) out.explanation = explanations.get(q.examQuestionId) ?? null;
    return out;
  });
  return view;
}

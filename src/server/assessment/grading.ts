/**
 * Pure grading rules (ADR-005). No I/O, no framework types.
 * Score = Σ marks of slots whose accepted option equals the key's correct option.
 * Unanswered/incorrect = 0. No negative marking. Integer arithmetic only.
 */

export interface KeyEntry {
  examQuestionId: string;
  correctOptionId: string;
  marks: number;
}

export interface QuestionOutcome {
  examQuestionId: string;
  selectedOptionId: string | null;
  correct: boolean;
  awarded: number;
  marks: number;
}

export interface GradeResult {
  score: number;
  maxScore: number;
  /** Percentage in basis points (0..10000), rounded half up. */
  percentBp: number;
  correctCount: number;
  answeredCount: number;
  perQuestion: QuestionOutcome[];
}

export class GradingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GradingError";
  }
}

export function gradeAttempt(keys: readonly KeyEntry[], answers: ReadonlyMap<string, string | null>): GradeResult {
  if (keys.length === 0) throw new GradingError("Exam version has no grading keys.");
  const keyIds = new Set<string>();
  for (const k of keys) {
    if (!Number.isInteger(k.marks) || k.marks < 1) throw new GradingError(`Invalid marks for slot ${k.examQuestionId}.`);
    if (!k.correctOptionId) throw new GradingError(`Missing correct option for slot ${k.examQuestionId}.`);
    if (keyIds.has(k.examQuestionId)) throw new GradingError(`Duplicate key for slot ${k.examQuestionId}.`);
    keyIds.add(k.examQuestionId);
  }
  for (const id of answers.keys()) if (!keyIds.has(id)) throw new GradingError(`Answer for unknown slot ${id}.`);

  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  let answeredCount = 0;
  const perQuestion: QuestionOutcome[] = [];
  for (const k of keys) {
    const selected = answers.get(k.examQuestionId) ?? null;
    const correct = selected !== null && selected === k.correctOptionId;
    const awarded = correct ? k.marks : 0;
    if (selected !== null) answeredCount++;
    if (correct) correctCount++;
    score += awarded;
    maxScore += k.marks;
    perQuestion.push({ examQuestionId: k.examQuestionId, selectedOptionId: selected, correct, awarded, marks: k.marks });
  }
  return { score, maxScore, percentBp: percentBasisPoints(score, maxScore), correctCount, answeredCount, perQuestion };
}

export function percentBasisPoints(score: number, max: number): number {
  if (max <= 0) throw new GradingError("Maximum score must be positive.");
  return Math.floor((score * 10000 * 2 + max) / (2 * max));
}

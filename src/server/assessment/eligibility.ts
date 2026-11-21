/**
 * The ONE place that decides whether a student may take/see an exam (R4.1, R12.3).
 * MVP rule: enabled STUDENT whose current grade equals the exam grade, exam PUBLISHED.
 * Future enrollment-based access replaces `isEligible` without touching grading or attempts.
 */
export type IneligibleReason = "NOT_STUDENT" | "DISABLED" | "NO_PROFILE" | "GRADE_MISMATCH" | "NOT_PUBLISHED";

export interface EligibilityFacts {
  role: "ADMIN" | "STUDENT";
  disabled: boolean;
  studentGradeId: string | null;
  examStatus: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  examGradeId: string;
}

export function isEligible(f: EligibilityFacts): { ok: true } | { ok: false; reason: IneligibleReason } {
  if (f.role !== "STUDENT") return { ok: false, reason: "NOT_STUDENT" };
  if (f.disabled) return { ok: false, reason: "DISABLED" };
  if (!f.studentGradeId) return { ok: false, reason: "NO_PROFILE" };
  if (f.examStatus !== "PUBLISHED") return { ok: false, reason: "NOT_PUBLISHED" };
  if (f.studentGradeId !== f.examGradeId) return { ok: false, reason: "GRADE_MISMATCH" };
  return { ok: true };
}

/** Prisma `where` fragment listing exams a student of `gradeId` can see on the dashboard. */
export function visibleExamsWhere(gradeId: string) {
  return { status: "PUBLISHED" as const, gradeId };
}

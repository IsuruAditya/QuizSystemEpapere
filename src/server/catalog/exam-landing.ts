import "server-only";
import { db } from "../db";
import { availability, isLateStart, remainingIfStartedAt } from "../assessment/deadline";
import { isEligible, type IneligibleReason } from "../assessment/eligibility";
import { releaseAt } from "../results/release-policy";

/** Landing-page facts. No question content is loaded here (R4.3). */
export async function examLanding(slug: string, userId: string) {
  const e = await db.exam.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, title: true, description: true, instructions: true, mode: true, status: true, gradeId: true,
      durationSeconds: true, opensAt: true, closesAt: true, allowLateStart: true, maxAttempts: true,
      scoreVisibility: true, correctnessVisibility: true, answerVisibility: true, explanationVisibility: true, reviewReleaseAt: true, leaderboardVisibility: true,
      coverMediaId: true,
      grade: { select: { level: true } },
      subject: { select: { nameSi: true, nameEn: true } },
      teacher: { select: { name: true, bio: true, photoMediaId: true } },
      currentVersion: { select: { questionCount: true, totalMarks: true } },
    },
  });
  if (!e || e.status === "DRAFT") return null;
  const u = await db.user.findUnique({ where: { id: userId }, select: { role: true, disabled: true, profile: { select: { gradeId: true } } } });
  const elig = isEligible({ role: u?.role ?? "STUDENT", disabled: u?.disabled ?? true, studentGradeId: u?.profile?.gradeId ?? null, examStatus: e.status, examGradeId: e.gradeId });
  const [{ now }] = (await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`) as [{ now: Date }];
  const attempts = await db.attempt.findMany({ where: { examId: e.id, userId }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, kind: true, voidedAt: true, replacementGranted: true, deadlineAt: true } });
  const active = attempts.find((a) => a.status === "IN_PROGRESS" && (!a.deadlineAt || a.deadlineAt > now)) ?? null;
  const official = attempts.find((a) => a.kind === "OFFICIAL" && !a.voidedAt) ?? null;
  const replacementAvailable = e.mode === "RANKED" && !official && attempts.some((a) => a.voidedAt && a.replacementGranted);
  const usedPractice = attempts.filter((a) => a.kind === "PRACTICE" && !a.voidedAt).length;
  const avail = availability(e, now);
  const lastFinished = attempts.find((a) => a.status !== "IN_PROGRESS" && !a.voidedAt) ?? null;
  let blocked: "NOT_OPEN" | "CLOSED" | "NO_ATTEMPTS" | "LATE_NOT_ALLOWED" | IneligibleReason | null = null;
  if (!elig.ok) blocked = elig.reason;
  else if (active) blocked = null;
  else if (avail === "UPCOMING") blocked = "NOT_OPEN";
  else if (avail === "CLOSED") blocked = "CLOSED";
  else if (e.mode === "RANKED" && (official || (attempts.length > 0 && !replacementAvailable))) blocked = "NO_ATTEMPTS";
  else if (e.mode === "PRACTICE" && e.maxAttempts !== null && usedPractice >= e.maxAttempts) blocked = "NO_ATTEMPTS";
  else if (!e.allowLateStart && isLateStart(now, e.durationSeconds, e.closesAt)) blocked = "LATE_NOT_ALLOWED";
  return {
    exam: e,
    availability: avail,
    eligible: elig.ok,
    blocked,
    activeAttemptId: active?.id ?? null,
    lastFinishedAttemptId: lastFinished?.id ?? null,
    practiceRemaining: e.mode === "PRACTICE" && e.maxAttempts !== null ? Math.max(0, e.maxAttempts - usedPractice) : null,
    lateStart: !active && avail === "OPEN" && isLateStart(now, e.durationSeconds, e.closesAt) ? remainingIfStartedAt(now, e.durationSeconds, e.closesAt) : null,
    releaseAt: releaseAt(e),
  };
}

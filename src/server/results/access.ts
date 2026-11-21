import "server-only";
import { db } from "../db";
import { AppError } from "../http/app-error";
import type { Actor } from "../auth/actor";
import { isEligible } from "../assessment/eligibility";
import { getLeaderboard } from "./leaderboard";

/** Who may read an exam's leaderboard: admins, or eligible students when visibility = STUDENTS. */
export async function examForLeaderboard(actor: Actor, slug: string) {
  const exam = await db.exam.findUnique({ where: { slug }, select: { id: true, title: true, slug: true, mode: true, status: true, gradeId: true, leaderboardVisibility: true, closesAt: true } });
  if (!exam || exam.status === "DRAFT") throw new AppError("NOT_FOUND", "Exam not found.");
  if (exam.mode !== "RANKED") throw new AppError("NOT_FOUND", "This exam has no leaderboard.");
  if (actor.role === "ADMIN") return exam;
  if (exam.leaderboardVisibility !== "STUDENTS") throw new AppError("ACCESS_DENIED", "The leaderboard is not public for this exam.");
  const u = await db.user.findUnique({ where: { id: actor.userId }, select: { disabled: true, profile: { select: { gradeId: true } } } });
  const e = isEligible({ role: actor.role, disabled: u?.disabled ?? true, studentGradeId: u?.profile?.gradeId ?? null, examStatus: exam.status === "ARCHIVED" ? "PUBLISHED" : exam.status, examGradeId: exam.gradeId });
  if (!e.ok) throw new AppError("ACCESS_DENIED", "You cannot view this leaderboard.");
  return exam;
}

/** Leaderboard use case: authorise the viewer for this exam, then read that exam's ranking only. */
export async function getLeaderboardForViewer(actor: Actor, slug: string, page: { page: number; pageSize: number }) {
  const exam = await examForLeaderboard(actor, slug);
  return getLeaderboard(exam.id, { ...page, viewerId: actor.userId });
}

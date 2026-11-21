import "server-only";
import { db } from "../db";
import { availability } from "../assessment/deadline";

/** Admin overview: computed on request (no live polling), bounded result sizes. */
export async function adminOverview() {
  const [{ now }] = (await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`) as [{ now: Date }];
  const exams = await db.exam.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { closesAt: "asc" },
    take: 50,
    select: { id: true, title: true, slug: true, mode: true, opensAt: true, closesAt: true, grade: { select: { level: true } } },
  });
  const counts = exams.length
    ? await db.$queryRaw<{ exam_id: string; in_progress: number; finalized: number }[]>`
        SELECT exam_id, COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress, COUNT(*) FILTER (WHERE status <> 'IN_PROGRESS')::int AS finalized
        FROM attempt WHERE exam_id = ANY(${exams.map((e) => e.id)}::uuid[]) AND voided_at IS NULL GROUP BY exam_id`
    : [];
  const byExam = new Map(counts.map((c) => [c.exam_id, c]));
  const [failedJobs, queuedJobs, overdue, recentImports] = await Promise.all([
    db.job.findMany({ where: { status: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, type: true, lastError: true, attempts: true, updatedAt: true } }),
    db.job.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } }),
    db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM attempt WHERE status = 'IN_PROGRESS' AND deadline_at < clock_timestamp() - interval '5 minutes'`,
    db.importJob.findMany({ where: { status: "STAGED", errorCount: { gt: 0 } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, fileName: true, errorCount: true, targetExamId: true, createdAt: true } }),
  ]);
  return {
    exams: exams.map((e) => ({ ...e, availability: availability(e, now), inProgress: byExam.get(e.id)?.in_progress ?? 0, finalized: byExam.get(e.id)?.finalized ?? 0 })),
    failedJobs,
    queuedJobs,
    overdueUnreconciled: overdue[0]?.n ?? 0,
    recentImports,
  };
}

export async function adminExamList(f: { q?: string; gradeId?: string; subjectId?: string; status?: "DRAFT" | "PUBLISHED" | "ARCHIVED"; page: number }) {
  const where = {
    ...(f.q ? { title: { contains: f.q, mode: "insensitive" as const } } : {}),
    ...(f.gradeId ? { gradeId: f.gradeId } : {}),
    ...(f.subjectId ? { subjectId: f.subjectId } : {}),
    ...(f.status ? { status: f.status } : {}),
  };
  const PAGE = 25;
  const [total, items] = await Promise.all([
    db.exam.count({ where }),
    db.exam.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (f.page - 1) * PAGE,
      take: PAGE,
      select: { id: true, slug: true, title: true, mode: true, status: true, opensAt: true, closesAt: true, grade: { select: { level: true } }, subject: { select: { nameEn: true } }, _count: { select: { attempts: true, draftItems: true } } },
    }),
  ]);
  return { total, pages: Math.max(1, Math.ceil(total / PAGE)), items };
}

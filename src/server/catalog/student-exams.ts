import "server-only";
import { db } from "../db";
import { availability, type Availability } from "../assessment/deadline";
import { visibleExamsWhere } from "../assessment/eligibility";

export interface StudentExamCard {
  slug: string;
  title: string;
  mode: "RANKED" | "PRACTICE";
  subjectSi: string;
  subjectEn: string;
  teacherName: string | null;
  teacherPhotoId: string | null;
  durationSeconds: number | null;
  opensAt: string | null;
  closesAt: string | null;
  availability: Availability;
  questionCount: number;
  totalMarks: number;
  myAttempt: { id: string; status: string } | null;
}

/** Published exams for the student's grade (eligibility service) with derived availability. */
export async function studentDashboard(userId: string): Promise<{ grade: number | null; displayName: string; exams: StudentExamCard[] }> {
  const p = await db.studentProfile.findUnique({ where: { userId }, select: { gradeId: true, displayName: true, grade: { select: { level: true } } } });
  if (!p) return { grade: null, displayName: "", exams: [] };
  const [{ now }] = (await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`) as [{ now: Date }];
  const exams = await db.exam.findMany({
    where: visibleExamsWhere(p.gradeId),
    orderBy: [{ closesAt: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true, slug: true, title: true, mode: true, durationSeconds: true, opensAt: true, closesAt: true,
      subject: { select: { nameSi: true, nameEn: true } },
      teacher: { select: { name: true, photoMediaId: true } },
      currentVersion: { select: { questionCount: true, totalMarks: true } },
      attempts: { where: { userId, voidedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true } },
    },
  });
  return {
    grade: p.grade.level,
    displayName: p.displayName,
    exams: exams.map((e) => ({
      slug: e.slug,
      title: e.title,
      mode: e.mode,
      subjectSi: e.subject.nameSi,
      subjectEn: e.subject.nameEn,
      teacherName: e.teacher?.name ?? null,
      teacherPhotoId: e.teacher?.photoMediaId ?? null,
      durationSeconds: e.durationSeconds,
      opensAt: e.opensAt?.toISOString() ?? null,
      closesAt: e.closesAt?.toISOString() ?? null,
      availability: availability(e, now),
      questionCount: e.currentVersion?.questionCount ?? 0,
      totalMarks: e.currentVersion?.totalMarks ?? 0,
      myAttempt: e.attempts[0] ?? null,
    })),
  };
}

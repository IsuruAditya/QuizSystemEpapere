import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import type { Actor } from "@/server/auth/actor";
import { insertCredentialUser } from "@/server/users/accounts";
import { createQuestion } from "@/server/authoring/questions";
import { createExam, publishExam, setDraftItems, type ExamSettings } from "@/server/authoring/exams";

export const PASSWORD = "Correct-Horse-9";

export async function truncateAll() {
  await db.$executeRawUnsafe(`TRUNCATE TABLE attempt_grade, attempt_answer, attempt, grading_key, exam_version, grading_revision, exam_question,
    exam_draft_item, exam, import_job, question_option, question_version, question, teacher, media, student_profile, session, account,
    verification, audit_event, job, rate_limit_bucket, app_setting, subject, grade, "user" RESTART IDENTITY CASCADE`);
}

export async function seedCatalog() {
  const g9 = await db.grade.create({ data: { level: 9, nameSi: "9 ශ්‍රේණිය", nameEn: "Grade 9" } });
  const g10 = await db.grade.create({ data: { level: 10, nameSi: "10 ශ්‍රේණිය", nameEn: "Grade 10" } });
  const maths = await db.subject.create({ data: { code: "MATH", nameSi: "ගණිතය", nameEn: "Mathematics" } });
  return { g9: g9.id, g10: g10.id, maths: maths.id };
}

function actorFor(userId: string, role: "ADMIN" | "STUDENT", username: string): Actor {
  return { userId, role, username, name: username, mustChangePassword: false, sessionId: "test" };
}

export async function makeAdmin(username = "admin.one") {
  const id = await db.$transaction((t) => insertCredentialUser(t, { username, name: "Admin", role: "ADMIN", password: PASSWORD, mustChangePassword: false }));
  return actorFor(id, "ADMIN", username);
}

let seq = 0;
export async function makeStudent(gradeId: string, display?: string) {
  const ep = `EP${String(10000 + ++seq)}${randomUUID().slice(0, 2).toUpperCase().replace(/[^0-9A-Z]/g, "X")}`;
  const id = await db.$transaction(async (t) => {
    const uid = await insertCredentialUser(t, { username: ep, name: display ?? ep, role: "STUDENT", password: PASSWORD, mustChangePassword: false });
    await t.studentProfile.create({ data: { userId: uid, epId: ep, fullName: display ?? ep, displayName: display ?? ep, gradeId } });
    return uid;
  });
  return actorFor(id, "STUDENT", ep.toLowerCase());
}

/** Question spec: correct option index and marks. Options are text "A-n".."D-n". */
export interface QSpec {
  correct: 0 | 1 | 2 | 3;
  marks: number;
}

export async function makeExam(
  admin: Actor,
  cat: { g9: string; maths: string },
  opts: { mode?: "RANKED" | "PRACTICE"; questions: QSpec[]; durationMinutes?: number | null; closesInMinutes?: number | null; maxAttempts?: number | null; title?: string },
) {
  const mode = opts.mode ?? "RANKED";
  const versionIds: string[] = [];
  for (const [i, q] of opts.questions.entries()) {
    const r = await createQuestion(
      admin,
      {
        stem: `Question ${i + 1} — ප්‍රශ්නය ${i + 1}`,
        options: [0, 1, 2, 3].map((k) => ({ text: `${"ABCD"[k]}-${i + 1}` })),
        correctIndex: q.correct,
        marks: q.marks,
        explanation: `Explanation ${i + 1}`,
      },
      `T-${i + 1}`,
      "test",
    );
    versionIds.push(r.versionId);
  }
  const closes = opts.closesInMinutes === null ? null : new Date(Date.now() + (opts.closesInMinutes ?? 240) * 60_000).toISOString();
  const s: ExamSettings = {
    title: opts.title ?? `Test exam ${randomUUID().slice(0, 6)}`,
    description: "",
    instructions: "",
    gradeId: cat.g9,
    subjectId: cat.maths,
    teacherId: null,
    coverMediaId: null,
    mode,
    durationMinutes: opts.durationMinutes === undefined ? 60 : opts.durationMinutes,
    opensAt: null,
    closesAt: closes,
    allowLateStart: true,
    maxAttempts: opts.maxAttempts ?? null,
    scoreVisibility: "IMMEDIATE",
    correctnessVisibility: mode === "PRACTICE" ? "IMMEDIATE" : "AFTER_RELEASE",
    answerVisibility: mode === "PRACTICE" ? "IMMEDIATE" : "AFTER_RELEASE",
    explanationVisibility: mode === "PRACTICE" ? "IMMEDIATE" : "AFTER_RELEASE",
    reviewReleaseAt: null,
    leaderboardVisibility: "STUDENTS",
  };
  const e = await createExam(admin, s, "test");
  await setDraftItems(admin, e.id, versionIds, "test");
  const { versionId } = await publishExam(admin, e.id, "test");
  const slots = await db.examQuestion.findMany({
    where: { examVersionId: versionId },
    orderBy: { position: "asc" },
    select: { id: true, questionVersion: { select: { options: { orderBy: { position: "asc" }, select: { id: true } } } } },
  });
  return {
    id: e.id,
    slug: e.slug,
    versionId,
    slots: slots.map((s) => ({ examQuestionId: s.id, optionIds: s.questionVersion.options.map((o) => o.id) })),
  };
}

export type ExamFx = Awaited<ReturnType<typeof makeExam>>;

/** Answer helper: pick option index per slot (null = unanswered). */
export function answersFor(exam: ExamFx, picks: (number | null)[]) {
  return picks.map((p, i) => ({ examQuestionId: exam.slots[i]!.examQuestionId, optionId: p === null ? null : exam.slots[i]!.optionIds[p]! }));
}

/** Move an attempt back in time (tests cannot wait an hour): keeps duration, shifts start/deadline. */
export async function shiftAttempt(attemptId: string, startedMinutesAgo: number, deadlineMinutesAgo: number | null) {
  await db.$executeRaw`UPDATE attempt SET started_at = clock_timestamp() - make_interval(mins => ${startedMinutesAgo}),
    deadline_at = CASE WHEN ${deadlineMinutesAgo}::int IS NULL THEN deadline_at ELSE clock_timestamp() - make_interval(mins => ${deadlineMinutesAgo}::int) END
    WHERE id = ${attemptId}::uuid`;
}

export const mid = () => randomUUID();

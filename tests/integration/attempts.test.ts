import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { AppError } from "@/server/http/app-error";
import { finalizeExpired, getAttemptForStudent, saveAnswers, startAttempt, submitAttempt, takeover } from "@/server/assessment/attempts";
import { getResultForStudent } from "@/server/results/review";
import { getLeaderboard } from "@/server/results/leaderboard";
import { runJobsOnce } from "@/server/platform/job-runner";
import { answersFor, makeAdmin, makeExam, makeStudent, mid, seedCatalog, shiftAttempt, truncateAll, type ExamFx } from "./fixtures";
import type { Actor } from "@/server/auth/actor";

let cat: Awaited<ReturnType<typeof seedCatalog>>;
let admin: Actor;
// 5 questions, weights 1,1,2,3,1 → max 8. Correct indices A,D,B,C,B (first and last option both used).
const SPEC = [
  { correct: 0, marks: 1 },
  { correct: 3, marks: 1 },
  { correct: 1, marks: 2 },
  { correct: 2, marks: 3 },
  { correct: 1, marks: 1 },
] as const;
const ALL_RIGHT = [0, 3, 1, 2, 1];

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
}

async function begin(student: Actor, exam: ExamFx) {
  const s = await startAttempt(student, exam.slug, { takeover: false });
  return { id: s.attemptId, token: s.controllerToken! };
}

beforeAll(async () => {
  await truncateAll();
  cat = await seedCatalog();
  admin = await makeAdmin();
});

describe("start / resume (§19.7, §19.8)", () => {
  let exam: ExamFx;
  beforeEach(async () => {
    exam = await makeExam(admin, cat, { questions: [...SPEC] });
  });

  it("20 concurrent start requests create exactly one official attempt and none fails (10 rounds)", async () => {
    // Regression: a racing request used to see the winner's new attempt as "already used" and fail with
    // NO_ATTEMPTS_REMAINING. Every request must resolve to the same attempt. Repeated to make the race likely.
    for (let round = 0; round < 10; round++) {
      const st = await makeStudent(cat.g9);
      const settled = await Promise.allSettled(Array.from({ length: 20 }, () => startAttempt(st, exam.slug, { takeover: false })));
      const failures = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected").map((s) => (s.reason as AppError).code ?? String(s.reason));
      expect(failures).toEqual([]);
      const results = settled.map((s) => (s as PromiseFulfilledResult<Awaited<ReturnType<typeof startAttempt>>>).value);
      expect(new Set(results.map((r) => r.attemptId)).size).toBe(1);
      expect(results.filter((r) => r.created).length).toBe(1);
      expect(await db.attempt.count({ where: { examId: exam.id, userId: st.userId } })).toBe(1);
    }
  });

  it("resume preserves deadline, saved selections and question order; does not hand out the controller token", async () => {
    const st = await makeStudent(cat.g9);
    const a = await begin(st, exam);
    await saveAnswers(st, a.id, { mutationId: mid(), baseRevision: 0, controllerToken: a.token, changes: answersFor(exam, [2, null, 1]) });
    const before = await getAttemptForStudent(st, a.id);
    const again = await startAttempt(st, exam.slug, { takeover: false });
    expect(again).toMatchObject({ attemptId: a.id, created: false, controllerToken: null });
    const after = await getAttemptForStudent(st, a.id);
    expect(after.deadlineAt).toBe(before.deadlineAt);
    expect(after.questions.map((q) => q.examQuestionId)).toEqual(before.questions.map((q) => q.examQuestionId));
    expect(after.questions.map((q) => q.options.map((o) => o.id))).toEqual(before.questions.map((q) => q.options.map((o) => o.id)));
    expect(after.answers[exam.slots[0]!.examQuestionId]).toBe(exam.slots[0]!.optionIds[2]);
    expect(after.revision).toBe(1);
  });

  it("student of another grade and disabled students cannot start", async () => {
    const other = await makeStudent(cat.g10);
    expect(await codeOf(startAttempt(other, exam.slug, { takeover: false }))).toBe("ACCESS_DENIED");
    const st = await makeStudent(cat.g9);
    await db.user.update({ where: { id: st.userId }, data: { disabled: true } });
    expect(await codeOf(startAttempt(st, exam.slug, { takeover: false }))).toBe("ACCESS_DENIED");
  });

  it("closed and not-yet-open exams reject new attempts", async () => {
    const st = await makeStudent(cat.g9);
    await db.$executeRaw`UPDATE exam SET opens_at = now() + interval '1 hour', closes_at = now() + interval '3 hours' WHERE id = ${exam.id}::uuid`;
    expect(await codeOf(startAttempt(st, exam.slug, { takeover: false }))).toBe("NOT_OPEN");
    await db.$executeRaw`UPDATE exam SET opens_at = now() - interval '3 hours', closes_at = now() - interval '1 second' WHERE id = ${exam.id}::uuid`;
    expect(await codeOf(startAttempt(st, exam.slug, { takeover: false }))).toBe("CLOSED");
  });

  it("late start gets deadline = close time (shorter duration)", async () => {
    await db.$executeRaw`UPDATE exam SET closes_at = now() + interval '10 minutes' WHERE id = ${exam.id}::uuid`;
    const st = await makeStudent(cat.g9);
    const a = await begin(st, exam);
    const row = await db.attempt.findUniqueOrThrow({ where: { id: a.id }, include: { exam: true } });
    expect(row.deadlineAt!.getTime()).toBe(row.exam.closesAt!.getTime());
  });

  it("ranked: one official attempt; void with replacement grants exactly one more", async () => {
    const st = await makeStudent(cat.g9);
    const a = await begin(st, exam);
    await submitAttempt(st, a.id, { mutationId: mid(), baseRevision: 0, controllerToken: a.token, finalChanges: [] });
    const again = await startAttempt(st, exam.slug, { takeover: false });
    expect(again).toMatchObject({ attemptId: a.id, status: "GRADED", created: false });
    await db.attempt.update({ where: { id: a.id }, data: { voidedAt: new Date(), voidReason: "test", replacementGranted: true } });
    const b = await startAttempt(st, exam.slug, { takeover: false });
    expect(b.created).toBe(true);
    expect((await db.attempt.findUniqueOrThrow({ where: { id: b.attemptId } })).replacesAttemptId).toBe(a.id);
    // The DB itself refuses a second non-void official attempt.
    await expect(
      db.$executeRaw`INSERT INTO attempt (id, exam_id, exam_version_id, user_id, kind, attempt_no, status, started_at, deadline_at, revision, controller_token)
        VALUES (gen_random_uuid(), ${exam.id}::uuid, ${exam.versionId}::uuid, ${st.userId}, 'OFFICIAL', 9, 'GRADED', now(), now() + interval '1 hour', 0, gen_random_uuid())`,
    ).rejects.toThrow();
  });
});

describe("saving (§19.6, §19.10, §19.11)", () => {
  let exam: ExamFx;
  let other: ExamFx;
  beforeAll(async () => {
    exam = await makeExam(admin, cat, { questions: [...SPEC] });
    other = await makeExam(admin, cat, { questions: [...SPEC] });
  });

  it("compare-and-swap: stale revision is rejected with canonical answers; duplicate mutation returns original ack", async () => {
    const st = await makeStudent(cat.g9);
    const a = await begin(st, exam);
    const m1 = mid();
    const ack1 = await saveAnswers(st, a.id, { mutationId: m1, baseRevision: 0, controllerToken: a.token, changes: answersFor(exam, [1]) });
    expect(ack1).toMatchObject({ revision: 1, duplicate: false });
    const dup = await saveAnswers(st, a.id, { mutationId: m1, baseRevision: 0, controllerToken: a.token, changes: answersFor(exam, [1]) });
    expect(dup).toMatchObject({ revision: 1, duplicate: true });
    await saveAnswers(st, a.id, { mutationId: mid(), baseRevision: 1, controllerToken: a.token, changes: answersFor(exam, [3]) });
    // A delayed older request (base 0 or 1) must not overwrite the newer answer (3).
    let err: AppError | undefined;
    try {
      await saveAnswers(st, a.id, { mutationId: mid(), baseRevision: 1, controllerToken: a.token, changes: answersFor(exam, [0]) });
    } catch (e) {
      err = e as AppError;
    }
    expect(err?.code).toBe("REVISION_CONFLICT");
    expect(err?.extra).toMatchObject({ revision: 2 });
    const v = await getAttemptForStudent(st, a.id);
    expect(v.answers[exam.slots[0]!.examQuestionId]).toBe(exam.slots[0]!.optionIds[3]);
  });

  it("concurrent saves with the same base revision: exactly one wins", async () => {
    const st = await makeStudent(cat.g9);
    const a = await begin(st, exam);
    const res = await Promise.allSettled([0, 1, 2, 3].map((k) => saveAnswers(st, a.id, { mutationId: mid(), baseRevision: 0, controllerToken: a.token, changes: answersFor(exam, [k]) })));
    expect(res.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(res.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason.code === "REVISION_CONFLICT")).toBe(true);
    expect((await db.attempt.findUniqueOrThrow({ where: { id: a.id } })).revision).toBe(1);
  });

  it("rejects foreign question IDs, options from another exam and options of another question", async () => {
    const st = await makeStudent(cat.g9);
    const a = await begin(st, exam);
    const base = { baseRevision: 0, controllerToken: a.token };
    expect(await codeOf(saveAnswers(st, a.id, { ...base, mutationId: mid(), changes: [{ examQuestionId: other.slots[0]!.examQuestionId, optionId: other.slots[0]!.optionIds[0]! }] }))).toBe("INVALID_OPTION");
    expect(await codeOf(saveAnswers(st, a.id, { ...base, mutationId: mid(), changes: [{ examQuestionId: exam.slots[0]!.examQuestionId, optionId: other.slots[0]!.optionIds[0]! }] }))).toBe("INVALID_OPTION");
    expect(await codeOf(saveAnswers(st, a.id, { ...base, mutationId: mid(), changes: [{ examQuestionId: exam.slots[0]!.examQuestionId, optionId: exam.slots[1]!.optionIds[0]! }] }))).toBe("INVALID_OPTION");
    expect(await db.attemptAnswer.count({ where: { attemptId: a.id } })).toBe(0);
  });

  it("another student's attempt is invisible (NOT_FOUND), not merely forbidden", async () => {
    const owner = await makeStudent(cat.g9);
    const thief = await makeStudent(cat.g9);
    const a = await begin(owner, exam);
    expect(await codeOf(getAttemptForStudent(thief, a.id))).toBe("NOT_FOUND");
    expect(await codeOf(saveAnswers(thief, a.id, { mutationId: mid(), baseRevision: 0, controllerToken: a.token, changes: answersFor(exam, [0]) }))).toBe("NOT_FOUND");
    expect(await codeOf(getResultForStudent(thief.userId, a.id))).toBe("NOT_FOUND");
  });

  it("takeover makes the previous tab/device read-only (CONFLICT CONTROLLER_CHANGED)", async () => {
    const st = await makeStudent(cat.g9);
    const a = await begin(st, exam);
    await saveAnswers(st, a.id, { mutationId: mid(), baseRevision: 0, controllerToken: a.token, changes: answersFor(exam, [1]) });
    const t2 = await takeover(st, a.id);
    expect(t2.controllerToken).not.toBe(a.token);
    expect(t2.revision).toBe(1);
    expect(await codeOf(saveAnswers(st, a.id, { mutationId: mid(), baseRevision: 1, controllerToken: a.token, changes: answersFor(exam, [2]) }))).toBe("CONTROLLER_CHANGED");
    expect(await codeOf(saveAnswers(st, a.id, { mutationId: mid(), baseRevision: 1, controllerToken: t2.controllerToken, changes: answersFor(exam, [2]) }))).toBe("OK");
  });

  it("student attempt payload never contains answer keys or explanations (§19.20)", async () => {
    const st = await makeStudent(cat.g9);
    const a = await begin(st, exam);
    const v = await getAttemptForStudent(st, a.id);
    const json = JSON.stringify(v);
    expect(json).not.toMatch(/isCorrect|correctOption|explanation|Explanation \d/i);
    const keys = await db.gradingKey.findMany({ where: { examVersionId: exam.versionId } });
    // Every option ID is present (needed for answering) but nothing marks which is correct.
    for (const k of keys) expect(json).toContain(k.correctOptionId);
    expect(Object.keys(v.questions[0]!.options[0]!).sort()).toEqual(["id", "media", "position", "text"]);
  });
});

describe("submit and grading (§19.5, §19.12, §19.14, §19.15)", () => {
  let exam: ExamFx;
  beforeAll(async () => {
    exam = await makeExam(admin, cat, { questions: [...SPEC] });
  });

  const cases: [string, (number | null)[], number][] = [
    ["all correct", ALL_RIGHT, 8],
    ["all wrong", [1, 0, 0, 0, 0], 0],
    ["partial weighted (q1 + q4)", [0, 0, 0, 2, 0], 4],
    ["unanswered except last", [null, null, null, null, 1], 1],
    ["nothing answered", [null, null, null, null, null], 0],
  ];
  for (const [name, picks, expected] of cases) {
    it(`${name} → ${expected}/8`, async () => {
      const st = await makeStudent(cat.g9);
      const a = await begin(st, exam);
      const changes = answersFor(exam, picks).filter((c) => c.optionId !== null);
      let rev = 0;
      if (changes.length) rev = (await saveAnswers(st, a.id, { mutationId: mid(), baseRevision: 0, controllerToken: a.token, changes })).revision;
      await submitAttempt(st, a.id, { mutationId: mid(), baseRevision: rev, controllerToken: a.token, finalChanges: [] });
      const row = await db.attempt.findUniqueOrThrow({ where: { id: a.id } });
      expect(row).toMatchObject({ status: "GRADED", score: expected, maxScore: 8, finalizeReason: "MANUAL" });
      expect(row.percentBp).toBe(Math.floor((expected * 10000 * 2 + 8) / 16));
    });
  }

  it("answer selected then immediately submitted (in finalChanges) is graded", async () => {
    const st = await makeStudent(cat.g9);
    const a = await begin(st, exam);
    const r1 = await saveAnswers(st, a.id, { mutationId: mid(), baseRevision: 0, controllerToken: a.token, changes: answersFor(exam, [0, 3, 1, 2]) });
    await submitAttempt(st, a.id, { mutationId: mid(), baseRevision: r1.revision, controllerToken: a.token, finalChanges: [answersFor(exam, ALL_RIGHT)[4]!] });
    expect((await db.attempt.findUniqueOrThrow({ where: { id: a.id } })).score).toBe(8);
  });

  it("duplicate submit and retry after commit return the same canonical result and time", async () => {
    const st = await makeStudent(cat.g9);
    const a = await begin(st, exam);
    const body = { mutationId: mid(), baseRevision: 0, controllerToken: a.token, finalChanges: answersFor(exam, ALL_RIGHT) };
    await submitAttempt(st, a.id, body);
    const first = await db.attempt.findUniqueOrThrow({ where: { id: a.id } });
    await new Promise((r) => setTimeout(r, 30));
    await submitAttempt(st, a.id, body); // retry after "lost response"
    await submitAttempt(st, a.id, { ...body, mutationId: mid(), finalChanges: answersFor(exam, [1, 1, 1, 1, 1]) }); // different payload, too late
    const after = await db.attempt.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.submittedAt).toEqual(first.submittedAt);
    expect(after.elapsedMs).toBe(first.elapsedMs);
    expect(after.score).toBe(8);
    expect(await db.attemptGrade.count({ where: { attemptId: a.id } })).toBe(1);
  });

  it("concurrent submits with different final snapshots: exactly one is applied", async () => {
    const st = await makeStudent(cat.g9);
    const a = await begin(st, exam);
    const right = submitAttempt(st, a.id, { mutationId: mid(), baseRevision: 0, controllerToken: a.token, finalChanges: answersFor(exam, ALL_RIGHT) });
    const wrong = submitAttempt(st, a.id, { mutationId: mid(), baseRevision: 0, controllerToken: a.token, finalChanges: answersFor(exam, [1, 0, 0, 0, 0]) });
    const res = await Promise.allSettled([right, wrong]);
    expect(res.every((r) => r.status === "fulfilled")).toBe(true);
    const applied = res.filter((r) => r.status === "fulfilled" && r.value.appliedFinalChanges).length;
    expect(applied).toBe(1);
    const row = await db.attempt.findUniqueOrThrow({ where: { id: a.id } });
    expect([0, 8]).toContain(row.score);
  });

  it("database failure mid-grading rolls back everything; retry succeeds; no fake score", async () => {
    const st = await makeStudent(cat.g9);
    const a = await begin(st, exam);
    const r1 = await saveAnswers(st, a.id, { mutationId: mid(), baseRevision: 0, controllerToken: a.token, changes: answersFor(exam, [0, 3]) });
    await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION fail_grade() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'simulated failure'; END $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER fail_grade BEFORE INSERT ON attempt_grade FOR EACH ROW EXECUTE FUNCTION fail_grade()`);
    try {
      await expect(submitAttempt(st, a.id, { mutationId: mid(), baseRevision: r1.revision, controllerToken: a.token, finalChanges: answersFor(exam, [null, null, 1]).slice(2) })).rejects.toThrow();
      const mid1 = await db.attempt.findUniqueOrThrow({ where: { id: a.id } });
      expect(mid1).toMatchObject({ status: "IN_PROGRESS", score: null, submittedAt: null, revision: 1 });
      expect(await db.attemptAnswer.count({ where: { attemptId: a.id } })).toBe(2); // acknowledged answers intact, final change rolled back
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fail_grade ON attempt_grade`);
    }
    await submitAttempt(st, a.id, { mutationId: mid(), baseRevision: 1, controllerToken: a.token, finalChanges: answersFor(exam, [null, null, 1]).slice(2) });
    expect((await db.attempt.findUniqueOrThrow({ where: { id: a.id } })).score).toBe(4);
  });

  it("grading fault (missing keys) leaves SUBMITTED with NULL score and a recovery job", async () => {
    const ex = await makeExam(admin, cat, { questions: [...SPEC] });
    const st = await makeStudent(cat.g9);
    const a = await begin(st, ex);
    const saved = await db.gradingKey.findMany({ where: { examVersionId: ex.versionId } });
    await db.gradingKey.deleteMany({ where: { examVersionId: ex.versionId } });
    await submitAttempt(st, a.id, { mutationId: mid(), baseRevision: 0, controllerToken: a.token, finalChanges: answersFor(ex, ALL_RIGHT) });
    const row = await db.attempt.findUniqueOrThrow({ where: { id: a.id } });
    expect(row).toMatchObject({ status: "SUBMITTED", score: null, maxScore: null });
    const result = await getResultForStudent(st.userId, a.id);
    expect(result).toMatchObject({ gradingState: "PENDING", score: null });
    expect(await db.job.count({ where: { type: "GRADE_ATTEMPT", dedupeKey: `grade:${a.id}` } })).toBe(1);
    await db.gradingKey.createMany({ data: saved });
    await db.job.updateMany({ where: { dedupeKey: `grade:${a.id}` }, data: { runAfter: new Date(Date.now() - 1000) } });
    await runJobsOnce(5000);
    expect((await db.attempt.findUniqueOrThrow({ where: { id: a.id } })).score).toBe(8);
  });
});

describe("deadline and expiry (§19.9, §19.13, §19.16, §19.17, §19.28)", () => {
  let exam: ExamFx;
  beforeAll(async () => {
    exam = await makeExam(admin, cat, { questions: [...SPEC], closesInMinutes: 600 });
  });

  it("browser closed at expiry: reconciliation grades saved answers with elapsed = deadline − start", async () => {
    const st = await makeStudent(cat.g9);
    const a = await begin(st, exam);
    await saveAnswers(st, a.id, { mutationId: mid(), baseRevision: 0, controllerToken: a.token, changes: answersFor(exam, [0, 3, 1]) });
    await shiftAttempt(a.id, 61, 1);
    const n = await finalizeExpired(100);
    expect(n).toBeGreaterThanOrEqual(1);
    const row = await db.attempt.findUniqueOrThrow({ where: { id: a.id } });
    expect(row).toMatchObject({ status: "GRADED", finalizeReason: "EXPIRED", score: 4 });
    expect(row.elapsedMs).toBe(row.deadlineAt!.getTime() - row.startedAt.getTime());
    expect(row.submittedAt).toEqual(row.deadlineAt);
  });

  it("saves and submit after the deadline are rejected even if the job has not run (lazy finalisation)", async () => {
    const st = await makeStudent(cat.g9);
    const a = await begin(st, exam);
    await saveAnswers(st, a.id, { mutationId: mid(), baseRevision: 0, controllerToken: a.token, changes: answersFor(exam, [0]) });
    await shiftAttempt(a.id, 70, 0);
    await new Promise((r) => setTimeout(r, 5));
    expect(await codeOf(saveAnswers(st, a.id, { mutationId: mid(), baseRevision: 1, controllerToken: a.token, changes: answersFor(exam, ALL_RIGHT) }))).toBe("ATTEMPT_FINALIZED");
    const row = await db.attempt.findUniqueOrThrow({ where: { id: a.id } });
    expect(row).toMatchObject({ status: "GRADED", finalizeReason: "EXPIRED", score: 1 });
    // A late submit carrying "offline" answers is accepted as a no-op receipt, never applied.
    const r = await submitAttempt(st, a.id, { mutationId: mid(), baseRevision: 1, controllerToken: a.token, finalChanges: answersFor(exam, ALL_RIGHT) });
    expect(r.appliedFinalChanges).toBe(false);
    expect((await db.attempt.findUniqueOrThrow({ where: { id: a.id } })).score).toBe(1);
  });

  it("race: concurrent save, submit and reconciliation near the deadline produce one coherent result", async () => {
    for (let i = 0; i < 5; i++) {
      const st = await makeStudent(cat.g9);
      const a = await begin(st, exam);
      const r1 = await saveAnswers(st, a.id, { mutationId: mid(), baseRevision: 0, controllerToken: a.token, changes: answersFor(exam, [0]) });
      // Deadline 150 ms from now, then fire everything around it.
      await db.$executeRaw`UPDATE attempt SET started_at = clock_timestamp() - interval '59 minutes', deadline_at = clock_timestamp() + interval '150 milliseconds' WHERE id = ${a.id}::uuid`;
      await new Promise((r) => setTimeout(r, 100 + i * 15));
      const out = await Promise.allSettled([
        saveAnswers(st, a.id, { mutationId: mid(), baseRevision: r1.revision, controllerToken: a.token, changes: answersFor(exam, [0, 3]) }),
        submitAttempt(st, a.id, { mutationId: mid(), baseRevision: r1.revision, controllerToken: a.token, finalChanges: answersFor(exam, ALL_RIGHT) }),
        finalizeExpired(10),
      ]);
      for (const o of out) if (o.status === "rejected") expect(["ATTEMPT_FINALIZED", "REVISION_CONFLICT"]).toContain((o.reason as AppError).code);
      await new Promise((r) => setTimeout(r, 200)); // past the deadline
      await finalizeExpired(10);
      const row = await db.attempt.findUniqueOrThrow({ where: { id: a.id } });
      expect(row.status).toBe("GRADED");
      expect(await db.attemptGrade.count({ where: { attemptId: a.id } })).toBe(1);
      // Possible outcomes: submit won (8, MANUAL), save won then expiry (2, EXPIRED), or expiry first (1, EXPIRED).
      const ok =
        (row.finalizeReason === "MANUAL" && row.score === 8 && row.submittedAt! < row.deadlineAt!) ||
        (row.finalizeReason === "EXPIRED" && [1, 2].includes(row.score!) && row.elapsedMs === row.deadlineAt!.getTime() - row.startedAt.getTime());
      expect(ok).toBe(true);
      const answers = await db.attemptAnswer.findMany({ where: { attemptId: a.id } });
      expect(answers.every((x) => x.updatedAt < row.deadlineAt!)).toBe(true); // nothing admitted at/after the deadline
    }
  });

  it("untimed practice: null deadline, not expired by reconciliation, resumable, submit works, no leaderboard", async () => {
    const ex = await makeExam(admin, cat, { mode: "PRACTICE", questions: [...SPEC], durationMinutes: null, closesInMinutes: null });
    const st = await makeStudent(cat.g9);
    const a = await begin(st, ex);
    const row0 = await db.attempt.findUniqueOrThrow({ where: { id: a.id } });
    expect(row0).toMatchObject({ kind: "PRACTICE", deadlineAt: null });
    await db.$executeRaw`UPDATE attempt SET started_at = clock_timestamp() - interval '20 days' WHERE id = ${a.id}::uuid`;
    await finalizeExpired(100);
    expect((await db.attempt.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("IN_PROGRESS");
    const resumed = await startAttempt(st, ex.slug, { takeover: false });
    expect(resumed.attemptId).toBe(a.id);
    await submitAttempt(st, a.id, { mutationId: mid(), baseRevision: 0, controllerToken: a.token, finalChanges: answersFor(ex, ALL_RIGHT) });
    expect((await db.attempt.findUniqueOrThrow({ where: { id: a.id } })).score).toBe(8);
    const lb = await getLeaderboard(ex.id, { page: 1, pageSize: 10, viewerId: st.userId });
    expect(lb.total).toBe(0);
    // Practice repeat attempts are independent.
    const second = await startAttempt(st, ex.slug, { takeover: false });
    expect(second.created).toBe(true);
    expect(second.attemptId).not.toBe(a.id);
  });

  it("practice with maxAttempts=1: 20 concurrent starts resume one attempt and none fails (10 rounds)", async () => {
    // Regression (same race class as ranked): a losing request must not count the winner's new
    // in-progress attempt towards the limit and fail with NO_ATTEMPTS_REMAINING.
    const ex = await makeExam(admin, cat, { mode: "PRACTICE", questions: [...SPEC], maxAttempts: 1 });
    for (let round = 0; round < 10; round++) {
      const st = await makeStudent(cat.g9);
      const settled = await Promise.allSettled(Array.from({ length: 20 }, () => startAttempt(st, ex.slug, { takeover: false })));
      const failures = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected").map((s) => (s.reason as AppError).code ?? String(s.reason));
      expect(failures).toEqual([]);
      const ids = new Set(settled.map((s) => (s as PromiseFulfilledResult<Awaited<ReturnType<typeof startAttempt>>>).value.attemptId));
      expect(ids.size).toBe(1);
      expect(await db.attempt.count({ where: { examId: ex.id, userId: st.userId } })).toBe(1);
    }
  });

  it("practice max attempts is enforced", async () => {
    const ex = await makeExam(admin, cat, { mode: "PRACTICE", questions: [...SPEC], maxAttempts: 1 });
    const st = await makeStudent(cat.g9);
    const a = await begin(st, ex);
    await submitAttempt(st, a.id, { mutationId: mid(), baseRevision: 0, controllerToken: a.token, finalChanges: [] });
    expect(await codeOf(startAttempt(st, ex.slug, { takeover: false }))).toBe("NO_ATTEMPTS_REMAINING");
  });
});

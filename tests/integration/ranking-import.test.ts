import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { saveAnswers, startAttempt, submitAttempt } from "@/server/assessment/attempts";
import { getLeaderboard, myRank, rankingStatus } from "@/server/results/leaderboard";
import { competitionRank } from "@/server/results/ranking-rules";
import { createGradingCorrection, exportResultsCsv, voidAttempt } from "@/server/results/admin-results";
import { getResultForStudent } from "@/server/results/review";
import { runJobsOnce } from "@/server/platform/job-runner";
import { commitImport, editAndRevalidate, stageImport } from "@/server/imports/imports";
import { createExam, defaultSettings, publishExam } from "@/server/authoring/exams";
import { readFileSync } from "node:fs";
import path from "node:path";
import { answersFor, makeAdmin, makeExam, makeStudent, mid, PASSWORD, seedCatalog, truncateAll, type ExamFx } from "./fixtures";
import type { Actor } from "@/server/auth/actor";

let cat: Awaited<ReturnType<typeof seedCatalog>>;
let admin: Actor;
const TWENTY = Array.from({ length: 20 }, () => ({ correct: 0 as const, marks: 1 }));

/** Create a graded official attempt with exactly `score` correct answers (of 20) and elapsed `ms`. */
async function graded(exam: ExamFx, name: string, score: number, ms: number) {
  const st = await makeStudent(cat.g9, name);
  const s = await startAttempt(st, exam.slug, { takeover: false });
  const picks = Array.from({ length: 20 }, (_, i) => (i < score ? 0 : 1));
  await submitAttempt(st, s.attemptId, { mutationId: mid(), baseRevision: 0, controllerToken: s.controllerToken!, finalChanges: answersFor(exam, picks) });
  // Elapsed is server-measured; set exact values for deterministic ordering tests.
  await db.$executeRaw`UPDATE attempt SET elapsed_ms = ${ms}, submitted_at = started_at + make_interval(secs => ${ms / 1000}) WHERE id = ${s.attemptId}::uuid`;
  return { student: st, attemptId: s.attemptId };
}
const min = (n: number) => n * 60_000;

beforeAll(async () => {
  await truncateAll();
  cat = await seedCatalog();
  admin = await makeAdmin();
});

describe("per-exam ranking (§13, §19.18)", () => {
  let A: ExamFx;
  let B: ExamFx;
  const people: Record<string, Awaited<ReturnType<typeof graded>>> = {};
  beforeAll(async () => {
    A = await makeExam(admin, cat, { questions: TWENTY, title: "Exam A" });
    B = await makeExam(admin, cat, { questions: TWENTY, title: "Exam B" });
    people.perfectSlow = await graded(A, "Perfect slow", 20, min(55));
    people.nineteenFast = await graded(A, "Nineteen fast", 19, min(20));
    people.e18fast = await graded(A, "Eighteen 30m", 18, min(30));
    people.e18slow = await graded(A, "Eighteen 60m", 18, min(60));
    people.tieA = await graded(A, "Tie A", 17, 1_234_567);
    people.tieB = await graded(A, "Tie B", 17, 1_234_567);
    people.after = await graded(A, "After tie", 17, 1_234_568);
    // Exam B winner (20/20 in 1 minute) must not appear in A.
    people.bWinner = await graded(B, "B winner", 20, min(1));
  });

  it("score before speed, exact ties share rank, competition ranks skip (SQL)", async () => {
    const lb = await getLeaderboard(A.id, { page: 1, pageSize: 50, viewerId: null });
    expect(lb.rows.map((r) => [r.displayName, r.rank])).toEqual([
      ["Perfect slow", 1],
      ["Nineteen fast", 2],
      ["Eighteen 30m", 3],
      ["Eighteen 60m", 4],
      ["Tie A", 5],
      ["Tie B", 5],
      ["After tie", 7],
    ].map(([n, r]) => (n === "Tie A" || n === "Tie B" ? [expect.stringMatching(/Tie [AB]/), r] : [n, r])));
    expect(lb.total).toBe(7);
  });

  it("SQL ranking agrees with the pure reference implementation", async () => {
    const lb = await getLeaderboard(A.id, { page: 1, pageSize: 50, viewerId: null });
    const ref = competitionRank(lb.rows.map((r) => ({ attemptId: r.attemptId, score: r.score, elapsedMs: r.elapsedMs })));
    expect(lb.rows.map((r) => [r.attemptId, r.rank])).toEqual(ref.map((r) => [r.attemptId, r.rank]));
  });

  it("isolation: another exam's results never enter this leaderboard", async () => {
    const a = await getLeaderboard(A.id, { page: 1, pageSize: 50, viewerId: null });
    expect(a.rows.some((r) => r.displayName === "B winner")).toBe(false);
    const b = await getLeaderboard(B.id, { page: 1, pageSize: 50, viewerId: people.bWinner!.student.userId });
    expect(b.rows.map((r) => r.displayName)).toEqual(["B winner"]);
    expect(b.me?.rank).toBe(1);
    expect(await myRank(A.id, people.bWinner!.student.userId)).toBeNull();
  });

  it("pagination keeps shared ranks across page boundaries and own rank is shown off-page", async () => {
    const p1 = await getLeaderboard(A.id, { page: 1, pageSize: 5, viewerId: people.after!.student.userId });
    const p2 = await getLeaderboard(A.id, { page: 2, pageSize: 5, viewerId: people.after!.student.userId });
    expect(p1.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(p2.rows.map((r) => r.rank)).toEqual([5, 7]);
    expect(p1.me).toMatchObject({ rank: 7, displayName: "After tie" });
    const ids = [...p1.rows, ...p2.rows].map((r) => r.attemptId);
    expect(new Set(ids).size).toBe(7);
  });

  it("leaderboard rows contain no contact or school data", async () => {
    const lb = await getLeaderboard(A.id, { page: 1, pageSize: 50, viewerId: null });
    expect(Object.keys(lb.rows[0]!).sort()).toEqual(["attemptId", "displayName", "elapsedMs", "isMe", "maxScore", "rank", "score"]);
  });

  it("excludes in-progress, void and practice attempts; void bumps ranking revision", async () => {
    const st = await makeStudent(cat.g9, "In progress");
    await startAttempt(st, A.slug, { takeover: false });
    let lb = await getLeaderboard(A.id, { page: 1, pageSize: 50, viewerId: null });
    expect(lb.rows.some((r) => r.displayName === "In progress")).toBe(false);
    expect(lb.status.reasons).toContain("ATTEMPTS_IN_PROGRESS");
    await voidAttempt(admin, people.perfectSlow!.attemptId, { reason: "Technical issue confirmed", grantReplacement: false, adminPassword: PASSWORD }, "t");
    lb = await getLeaderboard(A.id, { page: 1, pageSize: 50, viewerId: null });
    expect(lb.rows[0]!.displayName).toBe("Nineteen fast");
    expect(lb.status.rankingRevision).toBe(1);
    const practice = await makeExam(admin, cat, { mode: "PRACTICE", questions: TWENTY });
    const p = await makeStudent(cat.g9);
    const s = await startAttempt(p, practice.slug, { takeover: false });
    await submitAttempt(p, s.attemptId, { mutationId: mid(), baseRevision: 0, controllerToken: s.controllerToken!, finalChanges: answersFor(practice, Array(20).fill(0)) });
    expect((await getLeaderboard(practice.id, { page: 1, pageSize: 10, viewerId: null })).total).toBe(0);
  });

  it("void requires the admin's password", async () => {
    await expect(voidAttempt(admin, people.e18slow!.attemptId, { reason: "No password", grantReplacement: false, adminPassword: "wrong" }, "t")).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  });
});

describe("provisional/final and regrading (§19.19)", () => {
  it("FINAL only after close + reconciliation; regrade changes scores, never times; provisional while pending", async () => {
    const E = await makeExam(admin, cat, { questions: TWENTY.slice(0, 4), title: "Regrade exam" });
    const s1 = await makeStudent(cat.g9, "Picked A");
    const s2 = await makeStudent(cat.g9, "Picked B");
    for (const [st, pick] of [[s1, 0], [s2, 1]] as const) {
      const s = await startAttempt(st, E.slug, { takeover: false });
      await saveAnswers(st, s.attemptId, { mutationId: mid(), baseRevision: 0, controllerToken: s.controllerToken!, changes: answersFor(E, [pick, 0, 0, 0]) });
      await submitAttempt(st, s.attemptId, { mutationId: mid(), baseRevision: 1, controllerToken: s.controllerToken!, finalChanges: [] });
    }
    expect((await rankingStatus(E.id)).reasons).toEqual(["EXAM_OPEN"]);
    await db.$executeRaw`UPDATE exam SET closes_at = clock_timestamp() - interval '1 second', opens_at = NULL WHERE id = ${E.id}::uuid`;
    expect((await rankingStatus(E.id)).state).toBe("FINAL");
    const before = await db.attempt.findMany({ where: { examId: E.id }, orderBy: { id: "asc" } });
    expect(before.map((a) => a.score).sort()).toEqual([3, 4]);

    // Key for Q1 was wrong: the correct answer is B.
    await createGradingCorrection(admin, E.id, { reason: "Q1 key error reported by teacher", adminPassword: PASSWORD, changes: [{ examQuestionId: E.slots[0]!.examQuestionId, correctOptionId: E.slots[0]!.optionIds[1]! }] }, "t");
    const mid1 = await rankingStatus(E.id);
    expect(mid1.state).toBe("PROVISIONAL");
    expect(mid1.reasons).toContain("REGRADE_PENDING");
    expect((await getLeaderboard(E.id, { page: 1, pageSize: 10, viewerId: null })).total).toBe(0); // no mixed revisions
    await runJobsOnce(10_000);
    const after = await db.attempt.findMany({ where: { examId: E.id }, orderBy: { id: "asc" } });
    expect((await rankingStatus(E.id)).state).toBe("FINAL");
    const lb = await getLeaderboard(E.id, { page: 1, pageSize: 10, viewerId: null });
    expect(lb.rows[0]!.displayName).toBe("Picked B");
    expect(lb.status.rankingRevision).toBe(1);
    for (const [i, a] of after.entries()) {
      expect(a.elapsedMs).toBe(before[i]!.elapsedMs);
      expect(a.submittedAt).toEqual(before[i]!.submittedAt);
      expect(a.startedAt).toEqual(before[i]!.startedAt);
    }
    expect(await db.attemptGrade.count({ where: { attempt: { examId: E.id } } })).toBe(4); // original grades retained
    expect(await db.gradingRevision.count({ where: { examVersionId: E.versionId } })).toBe(2);
  });

  it("released review shows correctness only after release; before release nothing leaks", async () => {
    const E = await makeExam(admin, cat, { questions: TWENTY.slice(0, 2) });
    const st = await makeStudent(cat.g9);
    const s = await startAttempt(st, E.slug, { takeover: false });
    await submitAttempt(st, s.attemptId, { mutationId: mid(), baseRevision: 0, controllerToken: s.controllerToken!, finalChanges: answersFor(E, [0, 1]) });
    const before = await getResultForStudent(st.userId, s.attemptId);
    expect(before).toMatchObject({ score: 1, maxScore: 2, questions: [] });
    expect(JSON.stringify(before)).not.toMatch(/correctOptionId|isCorrect|Explanation \d/);
    await db.$executeRaw`UPDATE exam SET closes_at = clock_timestamp() - interval '1 second' WHERE id = ${E.id}::uuid`;
    const after = await getResultForStudent(st.userId, s.attemptId);
    expect(after.questions.length).toBe(2);
    expect(after.questions[0]).toMatchObject({ correct: true, correctOptionId: E.slots[0]!.optionIds[0], explanation: "Explanation 1" });
    expect(after.questions[1]).toMatchObject({ correct: false, awarded: 0 });
  });
});

describe("exports (§19.23)", () => {
  it("neutralises formula injection and scopes to one exam", async () => {
    const E = await makeExam(admin, cat, { questions: TWENTY.slice(0, 2) });
    const st = await makeStudent(cat.g9, "=HYPERLINK(\"http://evil\")");
    await db.studentProfile.update({ where: { userId: st.userId }, data: { school: "+cmd|' /C calc'!A0", district: "@SUM(1+1)" } });
    const s = await startAttempt(st, E.slug, { takeover: false });
    await submitAttempt(st, s.attemptId, { mutationId: mid(), baseRevision: 0, controllerToken: s.controllerToken!, finalChanges: [] });
    const other = await makeExam(admin, cat, { questions: TWENTY.slice(0, 2) });
    const o = await makeStudent(cat.g9, "Other exam person");
    const os = await startAttempt(o, other.slug, { takeover: false });
    await submitAttempt(o, os.attemptId, { mutationId: mid(), baseRevision: 0, controllerToken: os.controllerToken!, finalChanges: [] });
    const csv = await exportResultsCsv(E.id, { includeVoided: true });
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).toContain("'+cmd");
    expect(csv).toContain("'@SUM");
    expect(csv).not.toMatch(/(^|,)[=+@]/m);
    expect(csv).not.toContain("Other exam person");
  });
});

describe("CSV import workflow (§19.2, §19.3)", () => {
  const fx = (n: string) => new Uint8Array(readFileSync(path.join(__dirname, "..", "fixtures", "csv", n)));
  async function draftExam() {
    return createExam(admin, { ...defaultSettings("PRACTICE"), title: "Import target", description: "", instructions: "", gradeId: cat.g9, subjectId: cat.maths, teacherId: null, coverMediaId: null, mode: "PRACTICE", opensAt: null, closesAt: null, reviewReleaseAt: null, durationMinutes: 30 }, "t");
  }

  it("invalid rows block commit; fixing in preview + revalidate allows a commit; retry does not duplicate", async () => {
    const e = await draftExam();
    const staged = await stageImport(admin, { name: "e2e.csv", bytes: fx("e2e-one-error.csv") }, e.id, "t");
    expect(staged.errorCount).toBe(1);
    expect(staged.report.rowIssues[0]).toMatchObject({ rowNumber: 3, column: "correct_option" });
    await expect(commitImport(admin, staged.id, { allowDuplicate: false }, "t")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await db.examDraftItem.count({ where: { examId: e.id } })).toBe(0);
    const row = staged.rows.find((r) => r.rowNumber === 3)!;
    const fixed = await editAndRevalidate(admin, staged.id, { rows: [{ ...row, correct_option: "B" }], removeRowNumbers: [] }, "t");
    expect(fixed.errorCount).toBe(0);
    const [c1, c2] = await Promise.all([commitImport(admin, staged.id, { allowDuplicate: false }, "t"), commitImport(admin, staged.id, { allowDuplicate: false }, "t")]);
    expect(c1.questionVersionIds).toEqual(c2.questionVersionIds);
    expect([c1.alreadyCommitted, c2.alreadyCommitted].sort()).toEqual([false, true]);
    expect(await db.examDraftItem.count({ where: { examId: e.id } })).toBe(3);
    const opts = await db.questionOption.findMany({ where: { questionVersionId: c1.questionVersionIds[1]! }, orderBy: { position: "asc" } });
    expect(opts.map((o) => o.isCorrect)).toEqual([false, true, false, false]);
    expect(opts[1]!.text).toBe("ශ්‍රී ජයවර්ධනපුර කෝට්ටේ");
    // Same file again into the same exam needs explicit confirmation.
    const again = await stageImport(admin, { name: "e2e.csv", bytes: fx("e2e-one-error.csv") }, e.id, "t");
    expect(again.report.duplicateOf?.importId).toBe(staged.id);
  });

  it("published exams are never modified by an import", async () => {
    const e = await draftExam();
    const staged = await stageImport(admin, { name: "v.csv", bytes: fx("valid-example.csv") }, e.id, "t");
    await commitImport(admin, staged.id, { allowDuplicate: false }, "t");
    await publishExam(admin, e.id, "t");
    await expect(stageImport(admin, { name: "v.csv", bytes: fx("valid-example.csv") }, e.id, "t")).rejects.toMatchObject({ code: "CONFLICT" });
    const v = await db.exam.findUniqueOrThrow({ where: { id: e.id }, include: { currentVersion: true } });
    expect(v.currentVersion!.questionCount).toBe(3);
    expect(v.currentVersion!.totalMarks).toBe(4);
  });

  it("rejects non-CSV and spreadsheet archives", async () => {
    const e = await draftExam();
    await expect(stageImport(admin, { name: "x.xlsx", bytes: new Uint8Array([0x50, 0x4b, 3, 4]) }, e.id, "t")).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA" });
    await expect(stageImport(admin, { name: "x.csv", bytes: new Uint8Array([0x50, 0x4b, 3, 4]) }, e.id, "t")).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA" });
  });
});

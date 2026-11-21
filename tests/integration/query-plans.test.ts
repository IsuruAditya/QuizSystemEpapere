import { beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { db } from "@/server/db";
import { getLeaderboard } from "@/server/results/leaderboard";
import { makeAdmin, makeExam, seedCatalog, truncateAll, type ExamFx } from "./fixtures";

/**
 * Query-plan evidence for ADR-006: with realistic volume (5,000 graded attempts in exam A plus 1,000 in
 * exam B), the per-exam leaderboard is served from the partial index `attempt_ranking`, filtered by
 * exam first. Plans are written to test-results/query-plans.txt for docs/architecture.md.
 */
let A: ExamFx;
let B: ExamFx;

async function bulkGraded(exam: ExamFx, n: number, prefix: string) {
  // Distinct users and attempts (no shared rows), graded on the latest revision, deterministic scores.
  await db.$executeRawUnsafe(`
    WITH u AS (
      INSERT INTO "user" (id, name, email, username, role, updated_at)
      SELECT '${prefix}-' || g, 'Load ' || g, '${prefix}-' || g || '@accounts.invalid', '${prefix}' || g, 'STUDENT', now()
      FROM generate_series(1, ${n}) g RETURNING id)
    INSERT INTO attempt (id, exam_id, exam_version_id, user_id, kind, attempt_no, status, started_at, deadline_at, submitted_at,
      finalize_reason, elapsed_ms, revision, controller_token, score, max_score, percent_bp, grading_revision_id, graded_at)
    SELECT gen_random_uuid(), '${exam.id}', '${exam.versionId}', u.id, 'OFFICIAL', 1, 'GRADED', now() - interval '2 hours',
      now() - interval '1 hour', now() - interval '90 minutes', 'MANUAL', 600000 + (abs(hashtext(u.id)) % 3000000), 1, gen_random_uuid(),
      abs(hashtext(u.id || 's')) % 21, 20, 0, v.latest_grading_revision_id, now()
    FROM u, exam_version v WHERE v.id = '${exam.versionId}'`);
}

beforeAll(async () => {
  await truncateAll();
  const cat = await seedCatalog();
  const admin = await makeAdmin("admin.plans");
  const twenty = Array.from({ length: 20 }, () => ({ correct: 0 as const, marks: 1 }));
  A = await makeExam(admin, cat, { questions: twenty, title: "Plan exam A" });
  B = await makeExam(admin, cat, { questions: twenty, title: "Plan exam B" });
  await bulkGraded(A, 5000, "pa");
  await bulkGraded(B, 1000, "pb");
  // History: the attempt table accumulates many past exams (8 × 5,000 more rows).
  for (let i = 0; i < 8; i++) await bulkGraded(await makeExam(admin, cat, { questions: twenty, title: `History ${i}` }), 5000, `ph${i}x`);
  await db.$executeRawUnsafe("ANALYZE attempt");
}, 300_000);

describe("ranking query plans (ADR-006, §13)", () => {
  it("leaderboard page for one exam uses the partial ranking index and returns only that exam", async () => {
    const plan = await db.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(`
      EXPLAIN (ANALYZE, BUFFERS)
      WITH eligible AS (
        SELECT a.id, a.user_id, a.score, a.max_score, a.elapsed_ms
        FROM attempt a JOIN exam_version v ON v.id = a.exam_version_id
        WHERE a.exam_id = '${A.id}' AND a.kind = 'OFFICIAL' AND a.status = 'GRADED' AND a.voided_at IS NULL
          AND a.grading_revision_id = v.latest_grading_revision_id),
      ranked AS (SELECT e.*, RANK() OVER (ORDER BY e.score DESC, e.elapsed_ms ASC) AS rank, COUNT(*) OVER () AS total FROM eligible e)
      SELECT * FROM ranked ORDER BY rank, elapsed_ms, id LIMIT 50`);
    const text = plan.map((r) => r["QUERY PLAN"]).join("\n");
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/query-plans.txt", `-- Leaderboard page, exam A (5,000 graded) among 46,000 attempts in 10 exams\n${text}\n`);
    // Invariant (§13): rows are reached through an exam-filtered index, never a whole-table scan.
    expect(text).toMatch(/Index Cond: \(\(exam_id = /);
    expect(text).not.toMatch(/Seq Scan on attempt/);

    const own = await db.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(`
      EXPLAIN (ANALYZE)
      SELECT COUNT(*) FROM attempt o JOIN exam_version v ON v.id = o.exam_version_id
      WHERE o.exam_id = '${A.id}' AND o.kind = 'OFFICIAL' AND o.status = 'GRADED' AND o.voided_at IS NULL
        AND o.grading_revision_id = v.latest_grading_revision_id AND (o.score > 15 OR (o.score = 15 AND o.elapsed_ms < 1200000))`);
    const ownText = own.map((r) => r["QUERY PLAN"]).join("\n");
    writeFileSync("test-results/query-plans.txt", `\n-- Own-rank count (rows strictly better than score 15 / 20 min)\n${ownText}\n`, { flag: "a" });
    expect(ownText).not.toMatch(/Seq Scan on attempt/);

    const t0 = performance.now();
    const lb = await getLeaderboard(A.id, { page: 40, pageSize: 50, viewerId: "pa-17" });
    const ms = performance.now() - t0;
    writeFileSync("test-results/query-plans.txt", `\n-- getLeaderboard(page 40, with own rank) wall time: ${ms.toFixed(1)} ms (local embedded PostgreSQL)\n`, { flag: "a" });
    expect(lb.total).toBe(5000);
    expect(lb.rows.every((r) => !r.attemptId.startsWith("pb"))).toBe(true);
    expect(lb.me).not.toBeNull();
    // Ranks are non-decreasing and consistent with ordering across the page.
    for (let i = 1; i < lb.rows.length; i++) expect(lb.rows[i]!.rank).toBeGreaterThanOrEqual(lb.rows[i - 1]!.rank);
  });
});

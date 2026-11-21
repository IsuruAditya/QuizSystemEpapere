/**
 * Post-load integrity check (run after k6 against the same NON-production database):
 *   SLUG=<exam slug> npx tsx --conditions=react-server --env-file=.env scripts/load-verify.ts
 * Verifies: no student has more than one non-void official attempt; every finalised attempt is graded
 * with score <= max and no fake 0/1; no answer is timestamped at/after its attempt deadline;
 * one attempt_grade row per (attempt, revision).
 */
async function main() {
  if (process.env.APP_ENV === "production") throw new Error("Refusing to run against production.");
  const slug = process.env.SLUG;
  if (!slug) throw new Error("Set SLUG to the load-test exam slug.");
  const { db } = await import("@/server/db");
  const exam = await db.exam.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  const [dupOfficial] = await db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM (
      SELECT user_id FROM attempt WHERE exam_id = ${exam.id}::uuid AND kind = 'OFFICIAL' AND voided_at IS NULL GROUP BY user_id HAVING COUNT(*) > 1) d`;
  const [counts] = await db.$queryRaw<{ total: number; graded: number; submitted: number; in_progress: number }[]>`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'GRADED')::int AS graded, COUNT(*) FILTER (WHERE status = 'SUBMITTED')::int AS submitted,
      COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress FROM attempt WHERE exam_id = ${exam.id}::uuid`;
  const [badScore] = await db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM attempt
      WHERE exam_id = ${exam.id}::uuid AND status = 'GRADED' AND (score IS NULL OR score > max_score OR max_score <> 20)`;
  const [late] = await db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM attempt_answer aa JOIN attempt a ON a.id = aa.attempt_id
      WHERE a.exam_id = ${exam.id}::uuid AND a.deadline_at IS NOT NULL AND aa.updated_at >= a.deadline_at`;
  const [dupGrade] = await db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM (
      SELECT g.attempt_id FROM attempt_grade g JOIN attempt a ON a.id = g.attempt_id WHERE a.exam_id = ${exam.id}::uuid
      GROUP BY g.attempt_id, g.grading_revision_id HAVING COUNT(*) > 1) d`;
  const result = { ...counts, duplicateOfficialAttempts: dupOfficial!.n, invalidGradedScores: badScore!.n, answersAtOrAfterDeadline: late!.n, duplicateGradeRows: dupGrade!.n };
  console.log(JSON.stringify(result));
  await db.$disconnect();
  if (result.duplicateOfficialAttempts || result.invalidGradedScores || result.answersAtOrAfterDeadline || result.duplicateGradeRows) process.exit(1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};

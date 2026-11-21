import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { db } from "@/server/db";
import { saveAnswers, startAttempt } from "@/server/assessment/attempts";
import { isTransientDbError } from "@/server/http/route";
import { answersFor, makeAdmin, makeExam, makeStudent, mid, seedCatalog, truncateAll, type ExamFx } from "./fixtures";
import type { Actor } from "@/server/auth/actor";

/**
 * Pooled-connection safety (Neon PgBouncer, transaction mode): timeouts are SET LOCAL per transaction,
 * so they never leak to other work on the same server connection, and a request stuck behind a held
 * attempt lock fails fast as a retryable error instead of hanging.
 */
let exam: ExamFx;
let cat: Awaited<ReturnType<typeof seedCatalog>>;
let admin: Actor;

beforeAll(async () => {
  await truncateAll();
  cat = await seedCatalog();
  admin = await makeAdmin("admin.settings");
  exam = await makeExam(admin, cat, { questions: [{ correct: 0, marks: 1 }] });
});

describe("transaction-scoped settings", () => {
  it("a save blocked by a held attempt lock fails within ~5 s as TEMPORARY_FAILURE and writes nothing", async () => {
    const st = await makeStudent(cat.g9);
    const s = await startAttempt(st, exam.slug, { takeover: false });
    const holder = new Client({ connectionString: process.env.DATABASE_URL });
    await holder.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM attempt WHERE id = $1 FOR UPDATE", [s.attemptId]);
      const t0 = Date.now();
      const err = await saveAnswers(st, s.attemptId, { mutationId: mid(), baseRevision: 0, controllerToken: s.controllerToken!, changes: answersFor(exam, [0]) }).then(
        () => null,
        (e: unknown) => e,
      );
      const waited = Date.now() - t0;
      expect(err).not.toBeNull();
      expect(isTransientDbError(err)).toBe(true);
      expect(waited).toBeGreaterThanOrEqual(4_500);
      expect(waited).toBeLessThan(9_000);
    } finally {
      await holder.query("ROLLBACK");
      await holder.end();
    }
    expect(await db.attemptAnswer.count({ where: { attemptId: s.attemptId } })).toBe(0);
    expect((await db.attempt.findUniqueOrThrow({ where: { id: s.attemptId } })).revision).toBe(0);
  });

  it("SET LOCAL does not leak to later queries on the same pool", async () => {
    await db.$transaction(async (t) => {
      await t.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
    });
    // Run enough plain queries to touch every pooled connection.
    const values = await Promise.all(Array.from({ length: 25 }, () => db.$queryRaw<{ lock_timeout: string }[]>`SHOW lock_timeout`));
    expect(new Set(values.map((v) => v[0]!.lock_timeout))).toEqual(new Set(["0"]));
  });
});

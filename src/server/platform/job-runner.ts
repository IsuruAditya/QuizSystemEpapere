import "server-only";
import { finalizeExpired } from "../assessment/attempts";
import { gradeOne, regradeBatch } from "../results/admin-results";
import { claim, complete, continueLater, failAttempt } from "./jobs";
import { purgeStale } from "./rate-limit";
import { logger } from "./logger";
import { z } from "zod";

/** Job payload contracts (validated; a malformed payload fails the job visibly instead of misbehaving). */
const regradePayload = z.object({ examVersionId: z.string().uuid() });
const gradePayload = z.object({ attemptId: z.string().uuid() });

/**
 * One bounded dispatcher invocation (POST /api/internal/jobs/run, every minute via Vercel Cron or an
 * external scheduler). Safe to overlap: expiry uses SKIP LOCKED and jobs use leases.
 */
export async function runJobsOnce(budgetMs = 20_000) {
  const started = Date.now();
  const expired = await finalizeExpired(500);
  let ran = 0;
  let failed = 0;
  while (Date.now() - started < budgetMs) {
    const jobs = await claim(5);
    if (!jobs.length) break;
    for (const j of jobs) {
      try {
        if (j.type === "REGRADE_EXAM_VERSION") {
          const left = await regradeBatch(regradePayload.parse(j.payload).examVersionId);
          if (left > 0) await continueLater(j.id, { remaining: left });
          else await complete(j.id, { remaining: 0 });
        } else if (j.type === "GRADE_ATTEMPT") {
          if (!(await gradeOne(gradePayload.parse(j.payload).attemptId))) throw new Error("grading still failing");
          await complete(j.id);
        } else {
          throw new Error(`unknown job type ${j.type}`);
        }
        ran++;
      } catch (e) {
        failed++;
        await failAttempt(j, e);
      }
    }
  }
  const purged = await purgeStale();
  const out = { expiredFinalized: expired, jobsRun: ran, jobsFailed: failed, rateBucketsPurged: purged, ms: Date.now() - started };
  logger.info("job runner", out);
  return out;
}

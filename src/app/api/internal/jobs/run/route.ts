import { withRoute } from "@/server/http/route";
import { runJobsOnce } from "@/server/platform/job-runner";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Scheduled dispatcher. Authenticated with `Authorization: Bearer $CRON_SECRET`.
 * GET exists only because Vercel Cron issues GET requests (ADR-007); the work is idempotent and
 * the endpoint is not reachable without the secret. Other schedulers should use POST.
 */
const handler = withRoute({ auth: "cron" }, async () => runJobsOnce(20_000));
export const GET = handler;
export const POST = handler;

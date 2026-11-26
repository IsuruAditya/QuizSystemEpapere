import { withRoute } from "@/server/http/route";
import { runJobsOnce } from "@/server/platform/job-runner";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Scheduled dispatcher, called every minute by an external scheduler (POST) or, on Vercel Pro, by
 * Vercel Cron (which issues GET; ADR-007). Authenticated with `Authorization: Bearer $CRON_SECRET`;
 * the work is idempotent and the endpoint is not reachable without the secret.
 */
const handler = withRoute({ auth: "cron" }, async () => runJobsOnce(20_000));
export const GET = handler;
export const POST = handler;

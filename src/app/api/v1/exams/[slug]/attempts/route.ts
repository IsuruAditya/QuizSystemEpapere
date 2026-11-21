import { startBody } from "@/server/http/contracts";
import { slugParams, withRoute } from "@/server/http/route";
import { startAttempt } from "@/server/assessment/attempts";

export const runtime = "nodejs";

const body = startBody;

/** Start or resume the caller's attempt (idempotent). */
export const POST = withRoute({ auth: "student", body, params: slugParams }, async ({ actor, params, body }) => startAttempt(actor, params.slug, { takeover: body.takeover }));

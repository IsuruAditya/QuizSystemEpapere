import { idParams, withRoute } from "@/server/http/route";
import { saveAnswers, saveBody } from "@/server/assessment/attempts";

export const runtime = "nodejs";

/** Save an answer batch (compare-and-swap on baseRevision; idempotent by mutationId). */
export const PUT = withRoute({ auth: "student", body: saveBody, params: idParams, maxBytes: 32_768 }, async ({ actor, params, body }) => saveAnswers(actor, params.id, body));

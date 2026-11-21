import { idParams, withRoute } from "@/server/http/route";
import { submitAndReceipt, submitBody } from "@/server/results/receipt";

export const runtime = "nodejs";

/** Submit (idempotent). Returns the durable receipt plus whatever the release policy allows. */
export const POST = withRoute({ auth: "student", body: submitBody, params: idParams, maxBytes: 32_768 }, async ({ actor, params, body }) => submitAndReceipt(actor, params.id, body));

import { idParams, withRoute } from "@/server/http/route";
import { voidAttempt, voidBody } from "@/server/results/admin-results";

export const runtime = "nodejs";

export const POST = withRoute({ auth: "admin", body: voidBody, params: idParams }, async ({ actor, body, params, requestId }) => {
  await voidAttempt(actor, params.id, body, requestId);
  return { ok: true };
});

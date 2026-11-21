import { draftQuestionsBody } from "@/server/http/contracts";
import { idParams, withRoute } from "@/server/http/route";
import { setDraftItems } from "@/server/authoring/exams";

export const runtime = "nodejs";

const body = draftQuestionsBody;

/** Replace the ordered question list of a draft exam. */
export const PUT = withRoute({ auth: "admin", body, params: idParams }, async ({ actor, body, params, requestId }) => {
  await setDraftItems(actor, params.id, body.questionVersionIds, requestId);
  return { ok: true };
});

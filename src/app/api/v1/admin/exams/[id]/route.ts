import { idParams, withRoute } from "@/server/http/route";
import { examSettingsSchema, updateExam } from "@/server/authoring/exams";

export const runtime = "nodejs";

export const PUT = withRoute({ auth: "admin", body: examSettingsSchema, params: idParams }, async ({ actor, body, params, requestId }) => {
  await updateExam(actor, params.id, body, requestId);
  return { ok: true };
});

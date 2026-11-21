import { withRoute } from "@/server/http/route";
import { createExam, examSettingsSchema } from "@/server/authoring/exams";

export const runtime = "nodejs";

export const POST = withRoute({ auth: "admin", body: examSettingsSchema }, async ({ actor, body, requestId }) => createExam(actor, body, requestId));

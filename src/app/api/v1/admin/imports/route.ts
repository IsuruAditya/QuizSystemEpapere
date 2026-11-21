import { z } from "zod";
import { withRoute } from "@/server/http/route";
import { fileBytes, readForm } from "@/server/http/multipart";
import { env } from "@/server/env";
import { stageImportForActor } from "@/server/imports/imports";

export const runtime = "nodejs";

/** Upload a question CSV into staging for a draft exam (multipart: file, examId). */
export const POST = withRoute({ auth: "admin", rawBody: true }, async ({ actor, req, requestId }) => {
  const form = await readForm(req, env().IMPORT_MAX_BYTES);
  const examId = z.string().uuid().parse(form.get("examId"));
  return stageImportForActor(actor, await fileBytes(form), examId, requestId);
});

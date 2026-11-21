import { z } from "zod";
import { idParams, withRoute } from "@/server/http/route";
import { questionInputSchema, updateQuestion } from "@/server/authoring/questions";

export const runtime = "nodejs";

const body = z.object({ question: questionInputSchema });

/** Edit = new immutable version. */
export const PUT = withRoute({ auth: "admin", body, params: idParams }, async ({ actor, body, params, requestId }) => updateQuestion(actor, params.id, body.question, requestId));

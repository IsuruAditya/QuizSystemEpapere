import { z } from "zod";
import { questionSearchQuery } from "@/server/http/contracts";
import { withRoute } from "@/server/http/route";
import { createQuestion, listQuestions, questionInputSchema } from "@/server/authoring/questions";

export const runtime = "nodejs";

const body = z.object({ externalId: z.string().trim().max(64).nullish(), question: questionInputSchema, addToExamId: z.string().uuid().nullish() });

export const POST = withRoute({ auth: "admin", body }, async ({ actor, body, requestId }) =>
  createQuestion(actor, body.question, body.externalId || null, requestId, { addToExamId: body.addToExamId }),
);

const query = questionSearchQuery;

export const GET = withRoute({ auth: "admin", query }, async ({ query }) => listQuestions({ search: query.search || undefined, page: query.page, pageSize: query.pageSize }));

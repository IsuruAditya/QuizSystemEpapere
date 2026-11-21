import { z } from "zod";
import { withRoute } from "@/server/http/route";
import { runExamCommand, publishIssues } from "@/server/authoring/exams";

export const runtime = "nodejs";

const commandParams = z.object({ id: z.string().uuid(), action: z.enum(["publish", "unpublish", "archive", "duplicate"]) });
const queryParams = z.object({ id: z.string().uuid(), action: z.literal("publish-issues") });

/** Lifecycle commands: publish | unpublish | archive | duplicate. */
export const POST = withRoute({ auth: "admin", params: commandParams }, async ({ actor, params, requestId }) => runExamCommand(actor, params.id, params.action, requestId));

/** GET publish-issues: validation shown before publishing. */
export const GET = withRoute({ auth: "admin", params: queryParams }, async ({ params }) => ({ issues: await publishIssues(params.id) }));

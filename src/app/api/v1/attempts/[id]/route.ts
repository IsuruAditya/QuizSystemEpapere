import { idParams, withRoute } from "@/server/http/route";
import { getAttemptForStudent } from "@/server/assessment/attempts";

export const runtime = "nodejs";

export const GET = withRoute({ auth: "student", params: idParams }, async ({ actor, params }) => getAttemptForStudent(actor, params.id));

import { idParams, withRoute } from "@/server/http/route";
import { getResultForStudent } from "@/server/results/review";

export const runtime = "nodejs";

export const GET = withRoute({ auth: "student", params: idParams }, async ({ actor, params }) => getResultForStudent(actor.userId, params.id));

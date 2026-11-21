import { idParams, withRoute } from "@/server/http/route";
import { takeover } from "@/server/assessment/attempts";

export const runtime = "nodejs";

/** Explicit takeover: this tab becomes the only writer. */
export const POST = withRoute({ auth: "student", params: idParams }, async ({ actor, params }) => takeover(actor, params.id));

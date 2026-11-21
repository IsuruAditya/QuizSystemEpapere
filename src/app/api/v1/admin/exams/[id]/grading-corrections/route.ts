import { idParams, withRoute } from "@/server/http/route";
import { correctionBody, createGradingCorrection } from "@/server/results/admin-results";

export const runtime = "nodejs";

export const POST = withRoute({ auth: "admin", body: correctionBody, params: idParams }, async ({ actor, body, params, requestId }) => createGradingCorrection(actor, params.id, body, requestId));

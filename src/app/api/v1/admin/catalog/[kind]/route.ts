import { z } from "zod";
import { catalogBody } from "@/server/http/contracts";
import { withRoute } from "@/server/http/route";
import { catalogKind, saveCatalogRecord } from "@/server/catalog/catalog";

export const runtime = "nodejs";

const params = z.object({ kind: catalogKind });
const body = catalogBody;

/** Create/update grades, subjects, teachers; or set branding. `data` is validated per kind in the service. */
export const POST = withRoute({ auth: "admin", body, params }, async ({ actor, params, body, requestId }) => saveCatalogRecord(actor, params.kind, body.id ?? null, body.data, requestId));

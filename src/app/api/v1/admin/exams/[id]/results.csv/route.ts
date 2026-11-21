import { exportQuery } from "@/server/http/contracts";
import { idParams, withRoute } from "@/server/http/route";
import { fileResponse } from "@/server/http/responses";
import { exportResults } from "@/server/results/admin-results";

export const runtime = "nodejs";

const query = exportQuery;

/** Per-exam results export (personal data; admin only; formula-safe; audited). */
export const GET = withRoute({ auth: "admin", query, params: idParams }, async ({ actor, params, query, requestId }) => {
  const r = await exportResults(actor, params.id, { includeVoided: query.includeVoided === "1" }, requestId);
  return fileResponse({ bytes: r.csv, contentType: "text/csv; charset=utf-8", fileName: r.fileName });
});

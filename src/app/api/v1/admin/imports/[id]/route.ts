import { importCommand } from "@/server/http/contracts";
import { idParams, withRoute } from "@/server/http/route";
import { commitImport, discardImport, editAndRevalidate, editRowsBody, getImport } from "@/server/imports/imports";

export const runtime = "nodejs";

export const GET = withRoute({ auth: "admin", params: idParams }, async ({ params }) => getImport(params.id));

/** Edit staged rows and revalidate. */
export const PATCH = withRoute({ auth: "admin", body: editRowsBody, params: idParams, maxBytes: 2_000_000 }, async ({ actor, params, body, requestId }) => editAndRevalidate(actor, params.id, body, requestId));

const command = importCommand;

/** Commit (idempotent) or discard. */
export const POST = withRoute({ auth: "admin", body: command, params: idParams }, async ({ actor, params, body, requestId }) => {
  if (body.action === "commit") return commitImport(actor, params.id, { allowDuplicate: body.allowDuplicate }, requestId);
  await discardImport(actor, params.id, requestId);
  return { ok: true };
});

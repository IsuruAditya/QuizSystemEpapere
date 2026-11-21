import { withRoute } from "@/server/http/route";
import { fileBytes, readForm } from "@/server/http/multipart";
import { bulkRegister } from "@/server/users/students";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Bulk student registration CSV (multipart: file, commit=0|1). Validate first, then commit all-or-nothing. */
export const POST = withRoute({ auth: "admin", rawBody: true }, async ({ actor, req, requestId }) => {
  const form = await readForm(req, 512 * 1024);
  const f = await fileBytes(form);
  return bulkRegister(actor, f.bytes, form.get("commit") === "1", requestId);
});

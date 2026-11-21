import { z } from "zod";
import { withRoute } from "@/server/http/route";
import { fileResponse } from "@/server/http/responses";
import { readTemplate, templateName } from "@/server/catalog/templates";

export const runtime = "nodejs";

const params = z.object({ name: templateName });

/** CSV templates (admin only; the example contains answer keys for demo questions). */
export const GET = withRoute({ auth: "admin", params }, async ({ params }) =>
  fileResponse({ bytes: await readTemplate(params.name), contentType: "text/csv; charset=utf-8", fileName: params.name }),
);

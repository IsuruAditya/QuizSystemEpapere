import { idParams, withRoute } from "@/server/http/route";
import { AppError } from "@/server/http/app-error";
import { fileResponse } from "@/server/http/responses";
import { getMediaForDelivery } from "@/server/media/media";

export const runtime = "nodejs";

/** Authorised media delivery. Question images are private; portraits/covers are cacheable. */
export const GET = withRoute({ auth: "public", params: idParams }, async ({ params, actor }) => {
  const m = await getMediaForDelivery(params.id, actor);
  if (!m) throw new AppError("NOT_FOUND", "Not found.");
  return fileResponse({ bytes: m.bytes, contentType: m.contentType, cache: m.publicAsset ? "public-immutable" : "private" });
});

import { z } from "zod";
import { mediaAltBody } from "@/server/http/contracts";
import { withRoute } from "@/server/http/route";
import { fileBytes, readForm } from "@/server/http/multipart";
import { env } from "@/server/env";
import { setAltText, uploadMedia } from "@/server/media/media";

export const runtime = "nodejs";

/** Upload an image (multipart: file, kind, altText). */
export const POST = withRoute({ auth: "admin", rawBody: true }, async ({ actor, req, requestId }) => {
  const form = await readForm(req, env().MEDIA_MAX_BYTES);
  const kind = z.enum(["TEACHER_PHOTO", "EXAM_COVER", "QUESTION_IMAGE"]).parse(form.get("kind"));
  const altText = z.string().max(500).nullish().parse(form.get("altText"));
  const f = await fileBytes(form);
  return uploadMedia(actor, { kind, bytes: f.bytes, originalName: f.name, altText: altText ?? null }, requestId);
});

const altBody = mediaAltBody;
export const PATCH = withRoute({ auth: "admin", body: altBody }, async ({ actor, body, requestId }) => {
  await setAltText(actor, body.id, body.altText, requestId);
  return { ok: true };
});

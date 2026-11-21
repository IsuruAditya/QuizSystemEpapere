import "server-only";
import type { NextRequest } from "next/server";
import { AppError } from "./app-error";

/** Read a multipart form with a hard byte cap enforced before buffering (Vercel body limit is 4.5 MB). */
export async function readForm(req: NextRequest, maxBytes: number): Promise<FormData> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (!len || len > maxBytes + 64 * 1024) throw new AppError("PAYLOAD_TOO_LARGE", `Upload must be smaller than ${Math.round(maxBytes / 1024)} KB.`);
  if (!(req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) throw new AppError("UNSUPPORTED_MEDIA", "Expected a file upload.");
  try {
    return await req.formData();
  } catch {
    throw new AppError("VALIDATION_ERROR", "The upload could not be read.");
  }
}

export async function fileBytes(form: FormData, field = "file"): Promise<{ name: string; bytes: Uint8Array }> {
  const f = form.get(field);
  if (!(f instanceof File)) throw new AppError("VALIDATION_ERROR", "Choose a file to upload.", { errors: [{ path: field, message: "Required." }] });
  return { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) };
}

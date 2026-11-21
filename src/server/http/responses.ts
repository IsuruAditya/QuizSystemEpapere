import "server-only";
import { NextResponse } from "next/server";

/** HTTP-only helpers shared by route handlers (no business logic). */

export interface FileBody {
  bytes: Uint8Array | string;
  contentType: string;
  /** Download file name; omit for inline display. */
  fileName?: string;
  /** "private" (default) = never stored by shared caches; "public-immutable" for safe public assets. */
  cache?: "private" | "public-immutable";
}

export function fileResponse(f: FileBody): Response {
  const body = typeof f.bytes === "string" ? f.bytes : new Uint8Array(f.bytes);
  return new Response(body, {
    headers: {
      "Content-Type": f.contentType,
      "Content-Disposition": f.fileName ? `attachment; filename="${f.fileName.replace(/[^\w.-]/g, "_")}"` : "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": f.cache === "public-immutable" ? "public, max-age=86400, immutable" : "no-store, private",
    },
  });
}

/** JSON response that forwards Set-Cookie headers produced by the auth library. */
export function jsonWithCookies(data: unknown, cookieSource: Headers | null, extraCookies: string[] = []): NextResponse {
  const res = NextResponse.json(data);
  for (const c of cookieSource?.getSetCookie() ?? []) res.headers.append("Set-Cookie", c);
  for (const c of extraCookies) res.headers.append("Set-Cookie", c);
  return res;
}

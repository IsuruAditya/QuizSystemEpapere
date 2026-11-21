import { withRoute } from "@/server/http/route";
import { jsonWithCookies } from "@/server/http/responses";
import { logout } from "@/server/auth/login";

export const runtime = "nodejs";

const CLEAR = "ep.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax";

/** Revoke the session (if any) and always clear the cookie. */
export const POST = withRoute({ auth: "public" }, async ({ req }) => {
  const headers = await logout(req.headers).catch(() => null);
  return jsonWithCookies({ ok: true }, headers, [CLEAR]);
});

import { loginBody } from "@/server/http/contracts";
import { withRoute } from "@/server/http/route";
import { jsonWithCookies } from "@/server/http/responses";
import { login, postLoginPath } from "@/server/auth/login";

export const runtime = "nodejs";

const body = loginBody;

export const POST = withRoute({ auth: "public", body }, async ({ body, req, ip }) => {
  const r = await login({ username: body.username, password: body.password, ip, headers: req.headers });
  return jsonWithCookies({ ok: true, role: r.role, mustChangePassword: r.mustChangePassword, next: postLoginPath(r, body.returnTo) }, r.headers);
});

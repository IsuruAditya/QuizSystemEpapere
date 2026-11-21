import { passwordBody } from "@/server/http/contracts";
import { withRoute } from "@/server/http/route";
import { jsonWithCookies } from "@/server/http/responses";
import { changePassword } from "@/server/auth/login";

export const runtime = "nodejs";

const body = passwordBody;

/** Forwards the rotated session cookie so the user stays signed in on this device. */
export const POST = withRoute({ auth: "any", body, allowPasswordChange: true }, async ({ body, actor, req, requestId }) => {
  const cookies = await changePassword({ userId: actor.userId, current: body.currentPassword, next: body.newPassword, headers: req.headers, requestId });
  return jsonWithCookies({ ok: true }, cookies);
});

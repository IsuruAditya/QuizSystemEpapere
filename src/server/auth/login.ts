import "server-only";
import { z } from "zod";
import { db } from "../db";
import { AppError } from "../http/app-error";
import { hit, peek, reset } from "../platform/rate-limit";
import { audit } from "../platform/audit";
import { auth } from "./better-auth";
import { validateNewPassword } from "./passwords";
import { safeReturnTo } from "@/lib/return-to";

/**
 * Throttling policy (ADR-001):
 * - per account: 10 failed attempts / 15 min → RATE_LIMITED for the remainder of the window;
 * - per client IP: 600 attempts / 10 min (a whole school lab behind one NAT stays well below this).
 * Hashing cost is never reduced to make throughput targets.
 */
export const ACCOUNT_FAILURE_LIMIT = 10;
export const ACCOUNT_WINDOW_S = 15 * 60;
export const IP_LIMIT = 600;
export const IP_WINDOW_S = 10 * 60;

/** App-specific user fields returned by Better Auth (configured as additionalFields). */
const signedInUser = z.object({ id: z.string(), role: z.string().optional(), mustChangePassword: z.boolean().default(false) });

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export interface LoginResult {
  headers: Headers;
  role: "ADMIN" | "STUDENT";
  mustChangePassword: boolean;
}

export async function login(input: { username: string; password: string; ip: string; headers: Headers }): Promise<LoginResult> {
  const username = normalizeUsername(input.username);
  const acctKey = `login:acct:${username}`;
  const ipKey = `login:ip:${input.ip}`;

  const a = await peek(acctKey, ACCOUNT_WINDOW_S);
  if (a.count >= ACCOUNT_FAILURE_LIMIT) throw tooMany(a.resetAt);
  const ipHit = await hit(ipKey, IP_WINDOW_S);
  if (ipHit.count > IP_LIMIT) throw tooMany(ipHit.resetAt);

  let res: Awaited<ReturnType<typeof signIn>>;
  try {
    res = await signIn(username, input.password, input.headers);
  } catch {
    await hit(acctKey, ACCOUNT_WINDOW_S);
    // Same message for unknown user, wrong password and disabled account (no enumeration).
    throw new AppError("UNAUTHENTICATED", "The ID or password is incorrect.");
  }
  await reset(acctKey);
  const u = signedInUser.parse(res.response.user);
  return { headers: res.headers, role: u.role === "ADMIN" ? "ADMIN" : "STUDENT", mustChangePassword: u.mustChangePassword };
}

function signIn(username: string, password: string, headers: Headers) {
  return auth.api.signInUsername({ body: { username, password, rememberMe: true }, headers, returnHeaders: true });
}

function tooMany(resetAt: Date): AppError {
  const secs = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
  return new AppError("RATE_LIMITED", "Too many sign-in attempts. Please wait and try again.", {}, secs);
}

/** Where to send a user after sign-in: password change first, then a safe same-origin return URL or their home. */
export function postLoginPath(r: Pick<LoginResult, "role" | "mustChangePassword">, returnTo: string | undefined): string {
  const home = r.role === "ADMIN" ? "/admin" : "/student";
  const target = safeReturnTo(returnTo);
  const dest = target === "/" ? home : target;
  return r.mustChangePassword ? `/account/password?returnTo=${encodeURIComponent(dest)}` : dest;
}

export async function logout(headers: Headers): Promise<Headers> {
  const r = await auth.api.signOut({ headers, returnHeaders: true });
  return r.headers;
}

/**
 * Self-service password change (required after an admin reset). Revokes other sessions and
 * returns the auth library's Set-Cookie headers: it rotates THIS session, so the caller must forward them.
 */
export async function changePassword(input: { userId: string; current: string; next: string; headers: Headers; requestId: string }): Promise<Headers> {
  const problem = validateNewPassword(input.next);
  if (problem) throw new AppError("VALIDATION_ERROR", problem, { errors: [{ path: "newPassword", message: problem }] });
  if (input.current === input.next)
    throw new AppError("VALIDATION_ERROR", "Choose a password different from the temporary one.", {
      errors: [{ path: "newPassword", message: "Must differ from the current password." }],
    });
  let cookies: Headers;
  try {
    const r = await auth.api.changePassword({
      body: { currentPassword: input.current, newPassword: input.next, revokeOtherSessions: true },
      headers: input.headers,
      returnHeaders: true,
    });
    cookies = r.headers;
  } catch {
    throw new AppError("VALIDATION_ERROR", "The current password is incorrect.", {
      errors: [{ path: "currentPassword", message: "Incorrect password." }],
    });
  }
  await db.user.update({ where: { id: input.userId }, data: { mustChangePassword: false } });
  await audit({ actorId: input.userId, action: "auth.password_changed", targetType: "user", targetId: input.userId, requestId: input.requestId });
  return cookies;
}


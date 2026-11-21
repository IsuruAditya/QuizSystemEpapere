import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username } from "better-auth/plugins";
import { db } from "../db";
import { allowedOrigins, env } from "../env";
import { ADMIN_USERNAME_PATTERN, EP_ID_PATTERN } from "@/lib/identifiers";
export { ADMIN_USERNAME_PATTERN, EP_ID_PATTERN };


/**
 * Better Auth instance (ADR-001). Used only through `auth.api.*` server calls from our own
 * route handlers; the generic catch-all HTTP handler is intentionally NOT mounted.
 * - Credentials: username (EP ID for students) + password; public sign-up disabled.
 * - Hashing: Better Auth default scrypt (N=16384, r=16, p=1, dkLen=64, random 16-byte salt).
 * - Sessions: database sessions, no cookie cache, so revocation takes effect on the next request.
 */
function create() {
  const e = env();
  return betterAuth({
    appName: "e-Paperé Exams",
    secret: e.BETTER_AUTH_SECRET,
    baseURL: e.APP_ORIGIN,
    trustedOrigins: allowedOrigins(),
    database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: 12 * 60 * 60,
      updateAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    user: {
      additionalFields: {
        role: { type: "string", input: false, defaultValue: "STUDENT", required: false },
        disabled: { type: "boolean", input: false, defaultValue: false, required: false },
        mustChangePassword: { type: "boolean", input: false, defaultValue: false, required: false },
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Authoritative server-side block: disabled accounts never obtain a session.
          before: async (session) => {
            const u = await db.user.findUnique({ where: { id: session.userId }, select: { disabled: true } });
            if (!u || u.disabled) return false;
            return { data: session };
          },
        },
      },
    },
    plugins: [
      username({
        minUsernameLength: 4,
        maxUsernameLength: 30,
        usernameValidator: (u) => EP_ID_PATTERN.test(u.toUpperCase()) || ADMIN_USERNAME_PATTERN.test(u),
      }),
    ],
    // Our Postgres-backed per-account limiter is used instead (shared networks; ADR-001).
    rateLimit: { enabled: false },
    advanced: {
      useSecureCookies: e.APP_ENV === "production" || e.APP_ENV === "preview",
      cookiePrefix: "ep",
      ipAddress: { ipAddressHeaders: [e.CLIENT_IP_HEADER] },
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    },
    telemetry: { enabled: false },
  });
}

type AuthInstance = ReturnType<typeof create>;
const g = globalThis as unknown as { __auth?: AuthInstance };
export const auth: AuthInstance = g.__auth ?? create();
if (env().APP_ENV !== "production") g.__auth = auth;

export async function authContext() {
  return auth.$context;
}

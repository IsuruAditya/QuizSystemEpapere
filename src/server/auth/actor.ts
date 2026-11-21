import "server-only";
import { z } from "zod";
import { auth } from "./better-auth";

/** App fields on the Better Auth session user (validated rather than cast). */
const sessionUser = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string().nullish(),
  role: z.string().optional(),
  disabled: z.boolean().default(false),
  mustChangePassword: z.boolean().default(false),
});

export type Role = "ADMIN" | "STUDENT";

/** Explicit identity passed into services (never the raw request/cookie). */
export interface Actor {
  userId: string;
  role: Role;
  username: string;
  name: string;
  mustChangePassword: boolean;
  sessionId: string;
}

/** Resolve the authenticated, enabled actor for a request, or null. */
export async function resolveActor(headers: Headers): Promise<Actor | null> {
  const s = await auth.api.getSession({ headers });
  if (!s) return null;
  const u = sessionUser.safeParse(s.user);
  if (!u.success || u.data.disabled) return null;
  return {
    userId: u.data.id,
    role: u.data.role === "ADMIN" ? "ADMIN" : "STUDENT",
    username: u.data.username ?? "",
    name: u.data.name,
    mustChangePassword: u.data.mustChangePassword,
    sessionId: s.session.id,
  };
}

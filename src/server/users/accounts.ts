import "server-only";
import { randomUUID } from "node:crypto";
import type { Tx } from "../db";
import { hashPassword } from "../auth/passwords";

/**
 * Creates a Better Auth-compatible user + credential account directly (public sign-up is disabled).
 * Uses Better Auth's own password hasher. `email` is a synthetic non-routable address (C4).
 */
export async function insertCredentialUser(
  t: Tx,
  input: { username: string; name: string; role: "ADMIN" | "STUDENT"; password?: string; passwordHash?: string; mustChangePassword: boolean },
): Promise<string> {
  const id = randomUUID();
  const hash = input.passwordHash ?? (await hashPassword(input.password ?? ""));
  if (!input.passwordHash && !input.password) throw new Error("password required");
  const username = input.username.trim().toLowerCase();
  await t.user.create({
    data: {
      id,
      name: input.name,
      email: `${id}@accounts.invalid`,
      emailVerified: false,
      username,
      displayUsername: input.username.trim(),
      role: input.role,
      mustChangePassword: input.mustChangePassword,
    },
  });
  await t.account.create({ data: { id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash } });
  return id;
}

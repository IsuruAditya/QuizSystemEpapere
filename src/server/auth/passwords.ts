import "server-only";
import { randomInt } from "node:crypto";
import { db } from "../db";
import { authContext } from "./better-auth";

// Unambiguous characters (no 0/O, 1/l/I) so temporary passwords can be read out safely.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Cryptographically random temporary password (12 chars ≈ 69 bits). */
export function generateTemporaryPassword(length = 12): string {
  let s = "";
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export async function hashPassword(plain: string): Promise<string> {
  return (await authContext()).password.hash(plain);
}

/** Verify a user's current password (used for re-confirmation of sensitive admin actions). */
export async function verifyUserPassword(userId: string, plain: string): Promise<boolean> {
  const acct = await db.account.findFirst({ where: { userId, providerId: "credential" }, select: { password: true } });
  if (!acct?.password) return false;
  return (await authContext()).password.verify({ hash: acct.password, password: plain });
}

/** Revoke every session of a user (password reset, disable, role-affecting changes). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

export function validateNewPassword(p: string): string | null {
  if (p.length < 8) return "Password must be at least 8 characters.";
  if (p.length > 128) return "Password must be at most 128 characters.";
  return null;
}

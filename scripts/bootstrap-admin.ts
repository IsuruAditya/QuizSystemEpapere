/**
 * One-time administrator bootstrap (R2.12). No default credentials, no web setup route.
 *
 *   npm run admin:bootstrap -- --username admin.nimal --name "Nimal Admin"
 *   npm run admin:bootstrap -- --username second.admin --name "Second" --additional   (requires an existing admin; audited)
 *
 * A random temporary password is printed ONCE to this terminal; it must be changed at first sign-in.
 * Run it from a trusted machine against the intended DATABASE_URL (check the printed host first).
 */
import { parseArgs } from "node:util";

async function main() {
  const { values } = parseArgs({ options: { username: { type: "string" }, name: { type: "string" }, additional: { type: "boolean", default: false } } });
  const username = (values.username ?? "").trim().toLowerCase();
  const name = (values.name ?? "").trim();
  const { ADMIN_USERNAME_PATTERN } = await import("@/server/auth/better-auth");
  if (!ADMIN_USERNAME_PATTERN.test(username)) throw new Error("--username must be 4–30 chars: lowercase letters, digits, '.' or '_', starting with a letter (EP IDs are reserved for students).");
  if (name.length < 2) throw new Error("--name is required.");

  const { db } = await import("@/server/db");
  const { insertCredentialUser } = await import("@/server/users/accounts");
  const { generateTemporaryPassword } = await import("@/server/auth/passwords");
  const { audit } = await import("@/server/platform/audit");
  const host = new URL(process.env.DATABASE_URL ?? "postgresql://x").host;
  console.log(`Database host: ${host}`);

  const admins = await db.user.count({ where: { role: "ADMIN" } });
  if (admins > 0 && !values.additional) throw new Error("An administrator already exists. Use --additional to add another (audited).");
  if (admins === 0 && values.additional) throw new Error("No administrator exists yet; run without --additional.");
  if (await db.user.findUnique({ where: { username } })) throw new Error("That username is taken.");

  const password = generateTemporaryPassword(16);
  const id = await db.$transaction(async (t) => {
    const uid = await insertCredentialUser(t, { username, name, role: "ADMIN", password, mustChangePassword: true });
    await audit({ actorId: null, action: admins === 0 ? "admin.bootstrapped" : "admin.created_by_cli", targetType: "user", targetId: uid, detail: { username } }, t);
    return uid;
  });
  console.log(`\nAdministrator created: ${username} (id ${id})`);
  console.log(`Temporary password (shown once): ${password}`);
  console.log("Sign in at /login and choose a new password.\n");
  await db.$disconnect();
}

main().catch((e) => {
  console.error(`Error: ${(e as Error).message}`);
  process.exit(1);
});

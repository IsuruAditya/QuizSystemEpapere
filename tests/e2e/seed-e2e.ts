/** E2E seed: demo data (scripts/seed.ts) + an admin with a known password. Test databases only. */
import { execSync } from "node:child_process";

async function main() {
  if (process.env.APP_ENV !== "test") throw new Error("E2E seed only runs with APP_ENV=test");
  execSync("npx tsx --conditions=react-server scripts/seed.ts", { stdio: "inherit", env: process.env });
  const { db } = await import("@/server/db");
  const { insertCredentialUser } = await import("@/server/users/accounts");
  await db.$transaction((t) => insertCredentialUser(t, { username: "e2e.admin", name: "E2E Admin", role: "ADMIN", password: "Admin-Pass-1", mustChangePassword: false }));
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

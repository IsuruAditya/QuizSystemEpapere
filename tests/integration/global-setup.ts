import { execSync } from "node:child_process";

/** Recreate the test schema from migrations (also proves migrations apply to an empty database). */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54329/epapere_test";
  if (!/epapere_test|_test\b|test/i.test(url)) throw new Error(`Refusing to reset non-test database: ${url}`);
  execSync("npx prisma migrate reset --force", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url, CI: "1" } });
}

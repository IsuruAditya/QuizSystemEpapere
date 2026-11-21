import { execSync } from "node:child_process";
import { E2E_ENV } from "../../playwright.config";

/**
 * Fresh E2E database: create it if missing, apply migrations, seed demo catalog + students
 * with a known password, and create an E2E administrator (non-production only).
 */
export default async function globalSetup() {
  const env = { ...process.env, ...E2E_ENV, CI: "1", SEED_STUDENT_PASSWORD: "Student-Pass-1" };
  const admin = new URL(E2E_ENV.DATABASE_URL);
  const dbName = admin.pathname.slice(1);
  if (!/e2e|test/.test(dbName)) throw new Error(`Refusing to reset non-test database ${dbName}`);
  const { Client } = await import("pg");
  admin.pathname = "/postgres";
  const c = new Client({ connectionString: admin.toString() });
  await c.connect();
  const exists = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (!exists.rowCount) await c.query(`CREATE DATABASE "${dbName}" ENCODING 'UTF8' TEMPLATE template0`);
  await c.end();
  execSync("npx prisma migrate reset --force", { stdio: "pipe", env });
  execSync("npx tsx --conditions=react-server tests/e2e/seed-e2e.ts", { stdio: "inherit", env });
}

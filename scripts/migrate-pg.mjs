/**
 * Fallback for `prisma migrate deploy` that uses the Node `pg` driver instead of Prisma's native schema
 * engine. Use it only where the engine cannot connect but Node can (seen on one Windows machine with
 * Neon: P1001 after the connect timeout). Run: npm run db:migrate:node
 *
 * It does what `migrate deploy` does and records the result in Prisma's own `_prisma_migrations`
 * table in the same format, so Prisma treats the database as migrated (verified: `prisma migrate
 * status` reports "up to date" and the resulting schema is identical, see docs/deployment.md §7):
 * - holds Prisma's migration advisory lock, so it never runs concurrently with Prisma or itself;
 * - refuses to continue if an applied migration's file changed (checksum = SHA-256 of the file) or a
 *   previous migration failed;
 * - applies pending migrations in name order, each as one script (implicit transaction), recording
 *   start, finish and step count; on failure it records the error and stops.
 * Requires DIRECT_DATABASE_URL (non-pooled). Prints the host and database name only.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const PRISMA_MIGRATE_LOCK = 72707369; // advisory lock key used by Prisma Migrate on PostgreSQL
const DIR = path.resolve("prisma", "migrations");

const url = process.env.DIRECT_DATABASE_URL;
if (!url) fail("DIRECT_DATABASE_URL is not set (use the Neon direct, non-pooled connection string).");
const target = new URL(url);
if (target.hostname.includes("-pooler")) fail("DIRECT_DATABASE_URL points at the pooler; use the direct connection string.");

const files = readdirSync(DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()
  .map((name) => {
    const bytes = readFileSync(path.join(DIR, name, "migration.sql"));
    return { name, sql: bytes.toString("utf8"), checksum: createHash("sha256").update(bytes).digest("hex") };
  });

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30_000 });
process.stdout.write(`Database: ${target.pathname.slice(1)} at ${target.hostname}\n`);
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock($1)", [PRISMA_MIGRATE_LOCK]);
  await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
  )`);

  const { rows } = await client.query(
    `SELECT migration_name, checksum, finished_at IS NOT NULL AS finished FROM "_prisma_migrations" WHERE rolled_back_at IS NULL ORDER BY started_at`,
  );
  const applied = new Map(rows.map((r) => [r.migration_name, r]));
  const failed = rows.filter((r) => !r.finished);
  if (failed.length) fail(`A previous migration did not finish: ${failed.map((r) => r.migration_name).join(", ")}. Fix it before applying more (see docs/deployment.md §5).`);
  for (const f of files) {
    const a = applied.get(f.name);
    if (a && a.checksum !== f.checksum) fail(`Migration ${f.name} was changed after it was applied (checksum mismatch). Never edit applied migrations.`);
  }
  const unknown = rows.filter((r) => !files.some((f) => f.name === r.migration_name));
  if (unknown.length) process.stdout.write(`Warning: applied migrations not in this checkout: ${unknown.map((r) => r.migration_name).join(", ")}\n`);

  const pending = files.filter((f) => !applied.has(f.name));
  if (!pending.length) process.stdout.write(`No pending migrations (${files.length} applied).\n`);
  for (const f of pending) {
    const id = randomUUID();
    await client.query(`INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, applied_steps_count) VALUES ($1, $2, $3, now(), 0)`, [id, f.checksum, f.name]);
    try {
      await client.query(f.sql); // simple query protocol: the whole script runs in one implicit transaction
    } catch (e) {
      await client.query(`UPDATE "_prisma_migrations" SET logs = $2 WHERE id = $1`, [id, String(e?.message ?? e)]);
      fail(`Migration ${f.name} failed: ${e?.message ?? e}`);
    }
    await client.query(`UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1 WHERE id = $1`, [id]);
    process.stdout.write(`Applied ${f.name}\n`);
  }
} finally {
  await client.query("SELECT pg_advisory_unlock($1)", [PRISMA_MIGRATE_LOCK]).catch(() => undefined);
  await client.end();
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

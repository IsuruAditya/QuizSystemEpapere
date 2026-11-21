/**
 * Starts a real local PostgreSQL server (embedded-postgres binaries) for development and tests.
 * Data lives in ./.local-pg/data (git-ignored). Ctrl+C to stop.
 * Usage: npm run db:local:start
 * Dev/test only; production uses Neon.
 */
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import fs from "node:fs";

const port = Number(process.env.LOCAL_PG_PORT ?? 54329);
const dataDir = path.resolve(".local-pg", "data");

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
  // UTF-8 is mandatory: Sinhala text must round-trip. Locale C keeps collation deterministic.
  initdbFlags: ["--encoding=UTF8", "--locale=C", "--auth=scram-sha-256"],
});

if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) await pg.initialise();
await pg.start();
for (const db of ["epapere_dev", "epapere_test"]) {
  try {
    await pg.createDatabase(db);
  } catch {
    /* already exists */
  }
}
console.log(`PostgreSQL ready on 127.0.0.1:${port} (databases: epapere_dev, epapere_test). Ctrl+C to stop.`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);

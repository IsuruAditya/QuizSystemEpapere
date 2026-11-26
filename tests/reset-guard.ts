/**
 * Test setups run `prisma migrate reset --force`, which erases the database. Allow it only for a
 * local server (developer machine or the CI service container) and a database whose name marks it
 * as disposable, so a cloud URL (e.g. Neon staging or production) can never be reset by a test run.
 * The error names host and database only; the URL's password is never printed.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function assertResettableTestDb(url: string, namePattern: RegExp): void {
  const u = new URL(url);
  const db = u.pathname.slice(1);
  if (!LOCAL_HOSTS.has(u.hostname) || !namePattern.test(db)) {
    throw new Error(`Refusing to reset database "${db}" on host "${u.hostname}": tests reset only local databases named like ${namePattern}.`);
  }
}

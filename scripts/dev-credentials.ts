/**
 * LOCAL DEVELOPMENT ONLY: give the demo accounts known passwords so you can sign in and test.
 *   npm run dev:credentials
 * Refuses unless APP_ENV is local/test AND DATABASE_URL points at localhost/127.0.0.1.
 * Creates `admin.local` if missing; resets EP90001–EP90003 (created by `npm run db:seed`).
 * Never use these passwords anywhere else.
 */
const ADMIN = { username: "admin.local", password: "Admin-Local-1" };
const STUDENT_PASSWORD = "Student-Local-1";
const STUDENTS = ["EP90001", "EP90002", "EP90003"];

async function main() {
  const appEnv = process.env.APP_ENV ?? "local";
  const host = new URL(process.env.DATABASE_URL ?? "postgresql://x").hostname;
  if (!["local", "test"].includes(appEnv) || !["127.0.0.1", "localhost", "::1"].includes(host))
    throw new Error(`Refusing: dev credentials are only for a local database (APP_ENV=${appEnv}, host=${host}).`);

  const { db } = await import("@/server/db");
  const { hashPassword } = await import("@/server/auth/passwords");
  const { insertCredentialUser } = await import("@/server/users/accounts");

  const setPassword = async (username: string, password: string) => {
    const u = await db.user.findUnique({ where: { username: username.toLowerCase() }, select: { id: true } });
    if (!u) return false;
    const hash = await hashPassword(password);
    await db.account.updateMany({ where: { userId: u.id, providerId: "credential" }, data: { password: hash } });
    await db.user.update({ where: { id: u.id }, data: { mustChangePassword: false, disabled: false } });
    await db.session.deleteMany({ where: { userId: u.id } });
    return true;
  };

  if (!(await setPassword(ADMIN.username, ADMIN.password))) {
    await db.$transaction((t) => insertCredentialUser(t, { username: ADMIN.username, name: "Local Admin", role: "ADMIN", password: ADMIN.password, mustChangePassword: false }));
  }
  const missing: string[] = [];
  for (const ep of STUDENTS) if (!(await setPassword(ep, STUDENT_PASSWORD))) missing.push(ep);

  console.log(`Admin:    ${ADMIN.username} / ${ADMIN.password}`);
  console.log(`Students: ${STUDENTS.filter((s) => !missing.includes(s)).join(", ")} / ${STUDENT_PASSWORD}`);
  if (missing.length) console.log(`Missing students (run \`npm run db:seed\` first): ${missing.join(", ")}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(`Error: ${(e as Error).message}`);
  process.exit(1);
});

export {};

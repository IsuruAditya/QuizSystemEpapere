/**
 * Prepare a STAGING/TEST database for k6 (never production; never during a live exam).
 *   LOAD_STUDENTS=5000 LOAD_PASSWORD=... npm run load:prepare
 * Creates students EPL00001..EPLnnnnn (grade 9, distinct accounts) and a 20-question ranked exam
 * "LOAD TEST exam <date>" closing in LOAD_CLOSE_HOURS (default 3). Prints the exam slug for k6.
 * Passwords are hashed with the production scrypt parameters (no weakening for benchmarks).
 */
async function main() {
  if (process.env.APP_ENV === "production") throw new Error("Refusing to create load-test data in production.");
  const n = Number(process.env.LOAD_STUDENTS ?? 100);
  const password = process.env.LOAD_PASSWORD;
  if (!password || password.length < 8) throw new Error("Set LOAD_PASSWORD (>= 8 chars).");
  const closeHours = Number(process.env.LOAD_CLOSE_HOURS ?? 3);
  const { db } = await import("@/server/db");
  const { insertCredentialUser } = await import("@/server/users/accounts");
  const { hashPassword } = await import("@/server/auth/passwords");
  const { createQuestion } = await import("@/server/authoring/questions");
  const { createExam, publishExam, setDraftItems, defaultSettings } = await import("@/server/authoring/exams");

  const grade = await db.grade.upsert({ where: { level: 9 }, update: {}, create: { level: 9, nameSi: "9 ශ්‍රේණිය", nameEn: "Grade 9" } });
  const subject = await db.subject.upsert({ where: { code: "MATH" }, update: {}, create: { code: "MATH", nameSi: "ගණිතය", nameEn: "Mathematics" } });
  const admin = await db.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (!admin) throw new Error("Bootstrap an admin first (npm run admin:bootstrap).");
  const actor = { userId: admin.id, role: "ADMIN" as const, username: "load", name: "load", mustChangePassword: false, sessionId: "load" };

  // One hash reused for all load accounts: identical cost per login, far faster preparation.
  const hash = await hashPassword(password);
  let created = 0;
  for (let i = 1; i <= n; i += 200) {
    await db.$transaction(
      async (t) => {
        for (let k = i; k < Math.min(i + 200, n + 1); k++) {
          const ep = `EPL${String(k).padStart(5, "0")}`;
          if (await t.studentProfile.findUnique({ where: { epId: ep }, select: { userId: true } })) continue;
          const id = await insertCredentialUser(t, { username: ep, name: `Load ${k}`, role: "STUDENT", passwordHash: hash, mustChangePassword: false });
          await t.studentProfile.create({ data: { userId: id, epId: ep, fullName: `Load Student ${k}`, displayName: `L${k}`, gradeId: grade.id } });
          created++;
        }
      },
      { timeout: 60_000 },
    );
  }

  const versionIds: string[] = [];
  for (let q = 0; q < 20; q++) {
    const r = await createQuestion(actor, { stem: `Load question ${q + 1}: what is ${q} + ${q}?`, options: [0, 1, 2, 3].map((k) => ({ text: String(q * 2 + k) })), correctIndex: 0, marks: 1, explanation: null, topic: null, difficulty: null }, `LOAD-${q + 1}`, "load");
    versionIds.push(r.versionId);
  }
  const e = await createExam(
    actor,
    { ...defaultSettings("RANKED"), title: `LOAD TEST exam ${new Date().toISOString()}`, description: "Load test only.", instructions: "", gradeId: grade.id, subjectId: subject.id, teacherId: null, coverMediaId: null, mode: "RANKED", durationMinutes: 60, opensAt: null, closesAt: new Date(Date.now() + closeHours * 3_600_000).toISOString(), reviewReleaseAt: null },
    "load",
  );
  await setDraftItems(actor, e.id, versionIds, "load");
  await publishExam(actor, e.id, "load");
  console.log(JSON.stringify({ studentsCreated: created, students: n, examSlug: e.slug, examId: e.id }));
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};

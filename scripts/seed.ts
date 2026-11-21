/**
 * NON-PRODUCTION demo data (refuses APP_ENV=production). Idempotent: skips records that exist.
 *
 * Creates: grades 6–11; Mathematics, Science, Sinhala, ICT; a clearly labelled placeholder teacher
 * (no photo — upload a real one under Media); two DEMO exams for grade 9 with known answer keys
 * (they do not reproduce any real paper); demo students EP90001–EP90003.
 *
 * Demo student password: SEED_STUDENT_PASSWORD env var, or a random one printed once.
 *
 * DEMO-RANKED (5 questions, marks 1,1,2,1,1 = 6). Keys: B, D, A, C, B.
 *   e.g. answers B,D,A,C,B → 6/6; B,D,A,A,A → 4/6; all A → 2/6 (Q3 only).
 * DEMO-PRACTICE (3 questions, 1 mark each). Keys: C, A, B.
 */
import { randomBytes } from "node:crypto";

const RANKED = [
  { ext: "DEMO-M1", stem: "What is $12 \\times 5$?", options: ["50", "60", "65", "70"], correct: 1, marks: 1, explanation: "$12 \\times 5 = 60$." },
  { ext: "DEMO-M2", stem: "x සඳහා විසඳන්න: $2x + 3 = 11$", options: ["$x = 2$", "$x = 3$", "$x = 7$", "$x = 4$"], correct: 3, marks: 1, explanation: "$2x = 8$, එබැවින් $x = 4$." },
  { ext: "DEMO-M3", stem: "Which fraction is equal to $0.75$? (2 marks)", options: ["$\\frac{3}{4}$", "$\\frac{7}{5}$", "$\\frac{2}{3}$", "$\\frac{1}{4}$"], correct: 0, marks: 2, explanation: "$0.75 = \\frac{75}{100} = \\frac{3}{4}$." },
  { ext: "DEMO-M4", stem: "සෘජුකෝණාස්‍රයක දිග 8 cm සහ පළල 3 cm වේ. එහි වර්ගඵලය කුමක්ද?", options: ["11 cm²", "22 cm²", "24 cm²", "48 cm²"], correct: 2, marks: 1, explanation: "වර්ගඵලය = දිග × පළල = 8 × 3 = 24 cm²." },
  { ext: "DEMO-M5", stem: "The sum of the angles of a triangle is:", options: ["90°", "180°", "270°", "360°"], correct: 1, marks: 1, explanation: "Interior angles of a triangle add up to 180°." },
];
const PRACTICE = [
  { ext: "DEMO-S1", stem: "ජලයේ රසායනික සූත්‍රය කුමක්ද?", options: ["$CO_2$", "$O_2$", "$H_2O$", "$NaCl$"], correct: 2, marks: 1, explanation: "ජලය = $H_2O$." },
  { ext: "DEMO-S2", stem: "Which planet is closest to the Sun?", options: ["Mercury", "Venus", "Earth", "Mars"], correct: 0, marks: 1, explanation: "Mercury orbits closest to the Sun." },
  { ext: "DEMO-S3", stem: "ශාකවල ප්‍රභාසංස්ලේෂණය සිදුවන්නේ කුමන ඉන්ද්‍රිකාවේද?", options: ["න්‍යෂ්ටිය", "හරිතලවය", "මයිටොකොන්ඩ්‍රියාව", "රයිබසෝමය"], correct: 1, marks: 1, explanation: "ප්‍රභාසංස්ලේෂණය හරිතලවයේ සිදු වේ." },
];

async function main() {
  if (process.env.APP_ENV === "production") throw new Error("Refusing to seed demo data into production.");
  const { db } = await import("@/server/db");
  const { insertCredentialUser } = await import("@/server/users/accounts");
  const { createExam, publishExam, setDraftItems, defaultSettings } = await import("@/server/authoring/exams");
  const { createQuestion } = await import("@/server/authoring/questions");

  const grades: Record<number, string> = {};
  for (const level of [6, 7, 8, 9, 10, 11]) {
    const g = await db.grade.upsert({ where: { level }, update: {}, create: { level, nameSi: `${level} ශ්‍රේණිය`, nameEn: `Grade ${level}` } });
    grades[level] = g.id;
  }
  const subjects: Record<string, string> = {};
  for (const [code, si, en] of [["MATH", "ගණිතය", "Mathematics"], ["SCI", "විද්‍යාව", "Science"], ["SIN", "සිංහල", "Sinhala"], ["ICT", "තොරතුරු හා සන්නිවේදන තාක්ෂණය", "ICT"]] as const) {
    const s = await db.subject.upsert({ where: { code }, update: {}, create: { code, nameSi: si, nameEn: en } });
    subjects[code] = s.id;
  }
  let teacher = await db.teacher.findFirst({ where: { name: "Demo Teacher (placeholder)" } });
  teacher ??= await db.teacher.create({ data: { name: "Demo Teacher (placeholder)", bio: "Seed data only — replace with a real teacher and photo under Settings/Media." } });

  let admin = await db.user.findFirst({ where: { role: "ADMIN" }, select: { id: true, username: true } });
  if (!admin) {
    // Seed-only system author; it has no usable password (cannot sign in).
    const id = await db.$transaction((t) => insertCredentialUser(t, { username: "seed.system", name: "Seed system (no login)", role: "ADMIN", password: randomBytes(32).toString("base64url"), mustChangePassword: true }));
    await db.user.update({ where: { id }, data: { disabled: true } });
    admin = { id, username: "seed.system" };
  }
  const actor = { userId: admin.id, role: "ADMIN" as const, username: admin.username ?? "seed", name: "seed", mustChangePassword: false, sessionId: "seed" };

  const mkExam = async (title: string, mode: "RANKED" | "PRACTICE", subject: string, qs: typeof RANKED, durationMinutes: number | null) => {
    const existing = await db.exam.findFirst({ where: { title } });
    if (existing) return existing.slug;
    const versionIds: string[] = [];
    for (const q of qs) {
      const r = await createQuestion(actor, { stem: q.stem, options: q.options.map((text) => ({ text })), correctIndex: q.correct, marks: q.marks, explanation: q.explanation, topic: null, difficulty: null }, q.ext, "seed");
      versionIds.push(r.versionId);
    }
    const now = Date.now();
    const e = await createExam(
      actor,
      {
        ...defaultSettings(mode),
        title,
        description: "DEMO exam created by the seed script. Answer key documented in scripts/seed.ts. Not a real paper.",
        instructions: "Choose one answer for each question. ප්‍රශ්න සියල්ලටම පිළිතුරු සපයන්න.",
        gradeId: grades[9]!,
        subjectId: subjects[subject]!,
        teacherId: teacher.id,
        coverMediaId: null,
        mode,
        durationMinutes,
        opensAt: new Date(now - 60_000).toISOString(),
        closesAt: mode === "RANKED" ? new Date(now + 7 * 86_400_000).toISOString() : null,
        reviewReleaseAt: null,
      },
      "seed",
    );
    await setDraftItems(actor, e.id, versionIds, "seed");
    await publishExam(actor, e.id, "seed");
    return e.slug;
  };
  const rankedSlug = await mkExam("DEMO Grade 9 Mathematics — ranked", "RANKED", "MATH", RANKED, 30);
  const practiceSlug = await mkExam("DEMO Grade 9 Science — practice", "PRACTICE", "SCI", PRACTICE, null);

  const pw = process.env.SEED_STUDENT_PASSWORD ?? randomBytes(9).toString("base64url");
  const created: string[] = [];
  for (const [ep, name, display] of [["EP90001", "Demo Student One", "Kasun"], ["EP90002", "Demo Student Two", "Dilini"], ["EP90003", "Demo Student Three", "Ravindu"]] as const) {
    if (await db.studentProfile.findUnique({ where: { epId: ep } })) continue;
    await db.$transaction(async (t) => {
      const id = await insertCredentialUser(t, { username: ep, name, role: "STUDENT", password: pw, mustChangePassword: false });
      await t.studentProfile.create({ data: { userId: id, epId: ep, fullName: name, displayName: display, gradeId: grades[9]!, whatsappE164: "+94771234567" } });
    });
    created.push(ep);
  }
  console.log(`Seeded. Demo exams: /exams/${rankedSlug} and /exams/${practiceSlug}`);
  if (created.length) console.log(`Demo students ${created.join(", ")} — password: ${process.env.SEED_STUDENT_PASSWORD ? "(from SEED_STUDENT_PASSWORD)" : pw}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

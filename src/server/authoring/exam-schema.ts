import { z } from "zod";

/** Exam settings request schema (no database access). */
const vis = z.enum(["IMMEDIATE", "AFTER_RELEASE", "NEVER"]);
const isoOrNull = z.string().datetime({ offset: true }).nullable();

export const examSettingsSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().max(4000).default(""),
    instructions: z.string().max(8000).default(""),
    gradeId: z.string().uuid(),
    subjectId: z.string().uuid(),
    teacherId: z.string().uuid().nullable().default(null),
    coverMediaId: z.string().uuid().nullable().default(null),
    mode: z.enum(["RANKED", "PRACTICE"]),
    durationMinutes: z.number().int().min(1).max(600).nullable(),
    opensAt: isoOrNull.default(null),
    closesAt: isoOrNull.default(null),
    allowLateStart: z.boolean().default(true),
    maxAttempts: z.number().int().min(1).max(100).nullable().default(null),
    scoreVisibility: vis,
    correctnessVisibility: vis,
    answerVisibility: vis,
    explanationVisibility: vis,
    reviewReleaseAt: isoOrNull.default(null),
    leaderboardVisibility: z.enum(["STUDENTS", "HIDDEN"]).default("STUDENTS"),
  })
  .superRefine((v, ctx) => {
    if (v.opensAt && v.closesAt && new Date(v.opensAt) >= new Date(v.closesAt))
      ctx.addIssue({ code: "custom", path: ["closesAt"], message: "Close time must be after open time." });
    if (v.mode === "RANKED") {
      if (!v.closesAt) ctx.addIssue({ code: "custom", path: ["closesAt"], message: "Ranked exams need a close time." });
      if (v.durationMinutes === null) ctx.addIssue({ code: "custom", path: ["durationMinutes"], message: "Ranked exams must be timed." });
    }
  });
export type ExamSettings = z.infer<typeof examSettingsSchema>;

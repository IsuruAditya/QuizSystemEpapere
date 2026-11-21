import "server-only";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { db, tx } from "../db";
import { AppError } from "../http/app-error";
import { audit } from "../platform/audit";
import type { Actor } from "../auth/actor";
import { generateTemporaryPassword, hashPassword, verifyUserPassword } from "../auth/passwords";
import { insertCredentialUser } from "./accounts";
import { studentCommand, studentInput, studentUpdate, type StudentCommand, type StudentInput } from "./schemas";
export { studentCommand, studentInput, studentUpdate, type StudentCommand, type StudentInput };


export async function createStudent(actor: Actor, s: StudentInput, requestId: string): Promise<{ userId: string; epId: string; temporaryPassword: string }> {
  const temporaryPassword = generateTemporaryPassword();
  const userId = await tx(async (t) => {
    if (await t.studentProfile.findUnique({ where: { epId: s.epId }, select: { userId: true } }))
      throw new AppError("CONFLICT", `EP ID ${s.epId} already exists.`, { errors: [{ path: "epId", message: "Already in use." }] });
    const id = await insertCredentialUser(t, { username: s.epId, name: s.fullName, role: "STUDENT", password: temporaryPassword, mustChangePassword: true });
    await t.studentProfile.create({
      data: { userId: id, epId: s.epId, fullName: s.fullName, displayName: s.displayName, gradeId: s.gradeId, whatsappE164: s.whatsapp, school: s.school || null, district: s.district || null },
    });
    await audit({ actorId: actor.userId, action: "student.created", targetType: "user", targetId: id, requestId }, t);
    return id;
  });
  return { userId, epId: s.epId, temporaryPassword };
}

export async function updateStudent(actor: Actor, userId: string, s: z.infer<typeof studentUpdate>, requestId: string) {
  await tx(async (t) => {
    const p = await t.studentProfile.findUnique({ where: { userId }, select: { gradeId: true } });
    if (!p) throw new AppError("NOT_FOUND", "Student not found.");
    await t.studentProfile.update({
      where: { userId },
      data: { fullName: s.fullName, displayName: s.displayName, gradeId: s.gradeId, whatsappE164: s.whatsapp, school: s.school || null, district: s.district || null },
    });
    await t.user.update({ where: { id: userId }, data: { name: s.fullName } });
    await audit({ actorId: actor.userId, action: "student.updated", targetType: "user", targetId: userId, detail: { gradeChanged: p.gradeId !== s.gradeId }, requestId }, t);
  });
}

/**
 * Disable/enable (R2.4). Disabling revokes sessions immediately; an in-progress attempt is not
 * extended and is finalised at its deadline from acknowledged answers by expiry reconciliation.
 */
export async function setDisabled(actor: Actor, userId: string, disabled: boolean, requestId: string) {
  if (userId === actor.userId) throw new AppError("CONFLICT", "You cannot disable your own account.");
  await tx(async (t) => {
    const u = await t.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!u || u.role !== "STUDENT") throw new AppError("NOT_FOUND", "Student not found.");
    await t.user.update({ where: { id: userId }, data: { disabled } });
    if (disabled) await t.session.deleteMany({ where: { userId } });
    await audit({ actorId: actor.userId, action: disabled ? "student.disabled" : "student.enabled", targetType: "user", targetId: userId, requestId }, t);
  });
}

/** Admin-assisted reset (R2.5): requires the admin's password; returns a one-time temporary password. */
export async function resetStudentPassword(actor: Actor, userId: string, adminPassword: string, requestId: string) {
  if (!(await verifyUserPassword(actor.userId, adminPassword))) throw new AppError("ACCESS_DENIED", "Your password is incorrect.", { errors: [{ path: "adminPassword", message: "Incorrect password." }] });
  const temporaryPassword = generateTemporaryPassword();
  const hash = await hashPassword(temporaryPassword);
  await tx(async (t) => {
    const u = await t.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!u || u.role !== "STUDENT") throw new AppError("NOT_FOUND", "Student not found.");
    const n = await t.account.updateMany({ where: { userId, providerId: "credential" }, data: { password: hash } });
    if (n.count !== 1) throw new AppError("CONFLICT", "Account has no password credential.");
    await t.user.update({ where: { id: userId }, data: { mustChangePassword: true } });
    await t.session.deleteMany({ where: { userId } });
    await audit({ actorId: actor.userId, action: "student.password_reset", targetType: "user", targetId: userId, requestId }, t);
  });
  return { temporaryPassword };
}

/** Pseudonymise (C6): profile data cleared, login disabled, assessment history kept under the internal ID. */
export async function pseudonymiseStudent(actor: Actor, userId: string, adminPassword: string, requestId: string) {
  if (!(await verifyUserPassword(actor.userId, adminPassword))) throw new AppError("ACCESS_DENIED", "Your password is incorrect.");
  await tx(async (t) => {
    const p = await t.studentProfile.findUnique({ where: { userId }, select: { epId: true } });
    if (!p) throw new AppError("NOT_FOUND", "Student not found.");
    await t.studentProfile.update({ where: { userId }, data: { fullName: "Removed student", displayName: "Removed student", whatsappE164: null, school: null, district: null, pseudonymisedAt: new Date() } });
    await t.user.update({ where: { id: userId }, data: { name: "Removed student", disabled: true } });
    await t.session.deleteMany({ where: { userId } });
    await t.account.updateMany({ where: { userId }, data: { password: null } });
    await audit({ actorId: actor.userId, action: "student.pseudonymised", targetType: "user", targetId: userId, requestId }, t);
  });
}

/** Read model for the admin student detail screen. */
export async function getStudentDetail(userId: string) {
  const profile = await db.studentProfile.findUnique({ where: { userId }, include: { user: { select: { disabled: true, mustChangePassword: true } } } });
  if (!profile) return null;
  const [attempts, events] = await Promise.all([
    db.attempt.findMany({ where: { userId }, orderBy: { startedAt: "desc" }, take: 50, select: { id: true, kind: true, status: true, score: true, maxScore: true, startedAt: true, voidedAt: true, exam: { select: { id: true, title: true } } } }),
    db.auditEvent.findMany({ where: { targetType: "user", targetId: userId }, orderBy: { createdAt: "desc" }, take: 20, select: { action: true, createdAt: true } }),
  ]);
  return { profile, attempts, events };
}

export async function listStudents(opts: { search?: string; gradeId?: string; status?: "enabled" | "disabled"; page: number; pageSize: number }) {
  const where = {
    ...(opts.gradeId ? { gradeId: opts.gradeId } : {}),
    ...(opts.status ? { user: { disabled: opts.status === "disabled" } } : {}),
    ...(opts.search
      ? { OR: [{ epId: { contains: opts.search.toUpperCase() } }, { fullName: { contains: opts.search, mode: "insensitive" as const } }, { displayName: { contains: opts.search, mode: "insensitive" as const } }] }
      : {}),
  };
  const [total, rows] = await Promise.all([
    db.studentProfile.count({ where }),
    db.studentProfile.findMany({
      where,
      orderBy: { epId: "asc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: {
        userId: true, epId: true, fullName: true, displayName: true, whatsappE164: true, school: true, district: true, pseudonymisedAt: true,
        grade: { select: { id: true, level: true } },
        user: { select: { disabled: true, mustChangePassword: true } },
      },
    }),
  ]);
  return { total, items: rows };
}


/** Dispatch one account command. Only reset-password returns data (the one-time temporary password). */
export async function runStudentCommand(actor: Actor, userId: string, cmd: StudentCommand, requestId: string): Promise<{ ok: true; temporaryPassword?: string }> {
  switch (cmd.action) {
    case "disable":
    case "enable":
      await setDisabled(actor, userId, cmd.action === "disable", requestId);
      return { ok: true };
    case "reset-password":
      return { ok: true, ...(await resetStudentPassword(actor, userId, cmd.adminPassword, requestId)) };
    case "pseudonymise":
      await pseudonymiseStudent(actor, userId, cmd.adminPassword, requestId);
      return { ok: true };
  }
}

/* ───────────── bulk registration (separate from question import) ───────────── */

export const STUDENT_CSV_COLUMNS = ["ep_id", "full_name", "display_name", "grade", "whatsapp", "school", "district"] as const;

export interface BulkRowResult {
  rowNumber: number;
  epId: string;
  errors: string[];
}

/** Validate a registration CSV. Creates nothing unless every row is valid and `commit` is true. */
export async function bulkRegister(actor: Actor, bytes: Uint8Array, commit: boolean, requestId: string) {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new AppError("VALIDATION_ERROR", "The file is not valid UTF-8.");
  }
  let recs: Record<string, string>[];
  try {
    recs = parse(text, { columns: (h: string[]) => h.map((x) => x.trim().toLowerCase()), skip_empty_lines: true, relax_column_count: false });
  } catch (e) {
    throw new AppError("VALIDATION_ERROR", `CSV format error: ${(e as Error).message}`);
  }
  if (recs.length === 0) throw new AppError("VALIDATION_ERROR", "No student rows found.");
  if (recs.length > 500) throw new AppError("VALIDATION_ERROR", "At most 500 students per file. Split larger lists into several files.");
  const missing = STUDENT_CSV_COLUMNS.filter((c) => !(c in recs[0]!));
  if (missing.length) throw new AppError("VALIDATION_ERROR", `Missing column(s): ${missing.join(", ")}.`);

  const grades = new Map((await db.grade.findMany({ select: { id: true, level: true } })).map((g) => [String(g.level), g.id]));
  const existing = new Set((await db.studentProfile.findMany({ where: { epId: { in: recs.map((r) => (r.ep_id ?? "").trim().toUpperCase()) } }, select: { epId: true } })).map((x) => x.epId));
  const seen = new Set<string>();
  const results: BulkRowResult[] = [];
  const valid: StudentInput[] = [];
  recs.forEach((r, i) => {
    const errors: string[] = [];
    const parsed = studentInput.safeParse({
      epId: r.ep_id ?? "",
      fullName: r.full_name ?? "",
      displayName: (r.display_name ?? "").trim() || (r.full_name ?? "").trim().split(/\s+/)[0] || "",
      gradeId: grades.get((r.grade ?? "").trim()) ?? "",
      whatsapp: r.whatsapp ?? "",
      school: r.school,
      district: r.district,
    });
    if (!grades.get((r.grade ?? "").trim())) errors.push(`Unknown grade "${r.grade ?? ""}" (use 6–11).`);
    if (!parsed.success) for (const iss of parsed.error.issues) if (iss.path[0] !== "gradeId") errors.push(`${String(iss.path[0])}: ${iss.message}`);
    const ep = (r.ep_id ?? "").trim().toUpperCase();
    if (existing.has(ep)) errors.push(`EP ID ${ep} already exists.`);
    if (seen.has(ep)) errors.push(`EP ID ${ep} appears twice in this file.`);
    seen.add(ep);
    results.push({ rowNumber: i + 2, epId: ep, errors });
    if (!errors.length && parsed.success) valid.push(parsed.data);
  });
  const errorCount = results.filter((r) => r.errors.length).length;
  if (!commit || errorCount) return { committed: false, errorCount, results, credentials: [] as { epId: string; temporaryPassword: string }[] };

  const credentials: { epId: string; temporaryPassword: string }[] = [];
  // Hash outside the transaction (scrypt is deliberately slow), 8 at a time.
  const prepared: { s: StudentInput; pw: string; hash: string }[] = [];
  for (let i = 0; i < valid.length; i += 8) {
    const chunk = valid.slice(i, i + 8);
    prepared.push(...(await Promise.all(chunk.map(async (s) => { const pw = generateTemporaryPassword(); return { s, pw, hash: await hashPassword(pw) }; }))));
  }
  await tx(
    async (t) => {
      for (const { s, pw, hash } of prepared) {
        const id = await insertCredentialUser(t, { username: s.epId, name: s.fullName, role: "STUDENT", passwordHash: hash, mustChangePassword: true });
        await t.studentProfile.create({ data: { userId: id, epId: s.epId, fullName: s.fullName, displayName: s.displayName, gradeId: s.gradeId, whatsappE164: s.whatsapp, school: s.school || null, district: s.district || null } });
        credentials.push({ epId: s.epId, temporaryPassword: pw });
      }
      await audit({ actorId: actor.userId, action: "student.bulk_created", targetType: "user", targetId: "bulk", detail: { count: prepared.length }, requestId }, t);
    },
    { timeoutMs: 60_000 },
  );
  return { committed: true, errorCount: 0, results, credentials };
}

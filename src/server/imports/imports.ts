import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db, tx } from "../db";
import { env } from "../env";
import { AppError } from "../http/app-error";
import { audit } from "../platform/audit";
import { hit } from "../platform/rate-limit";
import type { Actor } from "../auth/actor";
import { insertVersion, mediaFacts } from "../authoring/questions";
import { parseQuestionCsv, validateStagedRows, type RowIssue, type StagedRow } from "./question-csv";
import { editRowsBody, reportSchema, resultSchema, stagedRowSchema, toJson } from "./stored";
export { editRowsBody };

export interface ImportReport {
  fileIssues: RowIssue[];
  rowIssues: RowIssue[];
  validRows: number;
  totalRows: number;
  duplicateOf: { importId: string; committedAt: string } | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function refs(rows: StagedRow[]): string[] {
  const cols = ["question_image_ref", "option_a_image_ref", "option_b_image_ref", "option_c_image_ref", "option_d_image_ref"] as const;
  return rows.flatMap((r) => cols.map((c) => r[c].trim().toLowerCase())).filter((v) => UUID.test(v));
}

async function buildReport(rows: StagedRow[], fileIssues: RowIssue[], duplicateOf: ImportReport["duplicateOf"]) {
  const media = await db.$transaction((t) => mediaFacts(t, refs(rows)));
  const validated = validateStagedRows(rows, media);
  const rowIssues = validated.flatMap((v) => v.issues);
  const report: ImportReport = { fileIssues, rowIssues, validRows: validated.filter((v) => v.input).length, totalRows: rows.length, duplicateOf };
  return { report, validated, errorCount: fileIssues.length + rowIssues.filter((i) => i.severity === "error").length, warningCount: rowIssues.filter((i) => i.severity === "warning").length };
}

/** Upload → parse → validate → stage (nothing touches exams yet). Raw bytes are not stored (C13). */
export async function stageImport(actor: Actor, file: { name: string; bytes: Uint8Array }, targetExamId: string, requestId: string) {
  const e = env();
  if (file.bytes.byteLength > e.IMPORT_MAX_BYTES) throw new AppError("PAYLOAD_TOO_LARGE", `File is larger than ${Math.round(e.IMPORT_MAX_BYTES / 1024)} KB.`);
  if (!/\.csv$/i.test(file.name)) throw new AppError("UNSUPPORTED_MEDIA", "Only .csv files are accepted.");
  if (file.bytes[0] === 0x50 && file.bytes[1] === 0x4b) throw new AppError("UNSUPPORTED_MEDIA", "This looks like an Excel/ZIP file. Save it as 'CSV UTF-8'.");
  const exam = await db.exam.findUnique({ where: { id: targetExamId }, select: { status: true } });
  if (!exam) throw new AppError("NOT_FOUND", "Target exam not found.");
  if (exam.status !== "DRAFT") throw new AppError("CONFLICT", "Questions can only be imported into a draft exam.");

  const sha = createHash("sha256").update(file.bytes).digest("hex");
  const prior = await db.importJob.findFirst({ where: { targetExamId, fileSha256: sha, status: "COMMITTED" }, select: { id: true, committedAt: true } });
  const { rows, fileIssues } = parseQuestionCsv(file.bytes, e.IMPORT_MAX_ROWS);
  const b = await buildReport(rows, fileIssues, prior ? { importId: prior.id, committedAt: prior.committedAt!.toISOString() } : null);
  const job = await db.importJob.create({
    data: {
      actorId: actor.userId,
      fileName: file.name.slice(0, 200),
      fileSha256: sha,
      byteSize: file.bytes.byteLength,
      targetExamId,
      rows: toJson(rows),
      report: toJson(b.report),
      errorCount: b.errorCount,
      warningCount: b.warningCount,
    },
    select: { id: true },
  });
  await audit({ actorId: actor.userId, action: "import.staged", targetType: "import_job", targetId: job.id, detail: { sha256: sha, rows: rows.length, errors: b.errorCount }, requestId });
  return getImport(job.id);
}

/** Upload use case with a per-admin upload throttle (30/minute). */
export async function stageImportForActor(actor: Actor, file: { name: string; bytes: Uint8Array }, targetExamId: string, requestId: string) {
  if ((await hit(`import:${actor.userId}`, 60)).count > 30) throw new AppError("RATE_LIMITED", "Too many uploads; wait a minute.");
  return stageImport(actor, file, targetExamId, requestId);
}

export async function getImport(importId: string) {
  const j = await db.importJob.findUnique({ where: { id: importId } });
  if (!j) throw new AppError("NOT_FOUND", "Import not found.");
  return {
    id: j.id,
    fileName: j.fileName,
    fileSha256: j.fileSha256,
    byteSize: j.byteSize,
    targetExamId: j.targetExamId,
    status: j.status,
    rows: z.array(stagedRowSchema).parse(j.rows),
    report: reportSchema.parse(j.report),
    errorCount: j.errorCount,
    warningCount: j.warningCount,
    result: j.result === null ? null : resultSchema.parse(j.result),
    createdAt: j.createdAt.toISOString(),
    committedAt: j.committedAt?.toISOString() ?? null,
  };
}


/** Edit staged rows in the preview and revalidate. Removal is explicit (never silent). */
export async function editAndRevalidate(actor: Actor, importId: string, body: z.infer<typeof editRowsBody>, requestId: string) {
  const j = await getImport(importId);
  if (j.status !== "STAGED") throw new AppError("CONFLICT", "This import is no longer editable.");
  const edits = new Map(body.rows.map((r) => [r.rowNumber, r]));
  const remove = new Set(body.removeRowNumbers);
  const rows = j.rows.filter((r) => !remove.has(r.rowNumber)).map((r) => edits.get(r.rowNumber) ?? r);
  const b = await buildReport(rows, [], j.report.duplicateOf);
  await db.importJob.update({
    where: { id: importId, status: "STAGED" },
    data: { rows: toJson(rows), report: toJson(b.report), errorCount: b.errorCount, warningCount: b.warningCount },
  });
  await audit({ actorId: actor.userId, action: "import.revalidated", targetType: "import_job", targetId: importId, detail: { edited: edits.size, removed: remove.size, errors: b.errorCount }, requestId });
  return getImport(importId);
}

/**
 * Commit valid staged rows into the draft exam as new bank questions (R3.11). Idempotent:
 * the import row is locked; a committed import returns its stored result without inserting.
 * All-or-nothing: any error rolls back the whole commit.
 */
export async function commitImport(actor: Actor, importId: string, opts: { allowDuplicate: boolean }, requestId: string) {
  const result = await tx(
    async (t) => {
      const lock = await t.$queryRaw<{ status: string; target_exam_id: string | null }[]>`
        SELECT status, target_exam_id FROM import_job WHERE id = ${importId}::uuid FOR UPDATE`;
      const j = lock[0];
      if (!j) throw new AppError("NOT_FOUND", "Import not found.");
      if (j.status === "COMMITTED") {
        const done = await t.importJob.findUniqueOrThrow({ where: { id: importId }, select: { result: true } });
        return { ...resultSchema.parse(done.result), alreadyCommitted: true };
      }
      if (j.status !== "STAGED" || !j.target_exam_id) throw new AppError("CONFLICT", "This import cannot be committed.");
      const examId = j.target_exam_id;
      const exam = await t.$queryRaw<{ status: string }[]>`SELECT status FROM exam WHERE id = ${examId}::uuid FOR UPDATE`;
      if (exam[0]?.status !== "DRAFT") throw new AppError("CONFLICT", "The target exam is no longer a draft. Published exams are never changed by imports.");

      const job = await t.importJob.findUniqueOrThrow({ where: { id: importId }, select: { rows: true, report: true } });
      const rows = z.array(stagedRowSchema).parse(job.rows);
      const report = reportSchema.parse(job.report);
      if (report.duplicateOf && !opts.allowDuplicate)
        throw new AppError("CONFLICT", "This exact file was already imported into this exam. Confirm to import it again.", { duplicateOf: report.duplicateOf });
      const validated = validateStagedRows(rows, await mediaFacts(t, refs(rows)));
      const errors = validated.flatMap((v) => v.issues).filter((i) => i.severity === "error");
      if (errors.length || validated.length === 0)
        throw new AppError("VALIDATION_ERROR", "Fix all errors before committing.", { errorCount: errors.length });

      const existing = await t.examDraftItem.aggregate({ where: { examId }, _max: { position: true } });
      let pos = (existing._max.position ?? -1) + 1;
      const versionIds: string[] = [];
      for (const v of validated) {
        const q = await t.question.create({ data: { createdById: actor.userId, externalId: v.externalId }, select: { id: true } });
        const vid = await insertVersion(t, q.id, 1, v.input!, actor.userId);
        await t.examDraftItem.create({ data: { examId, position: pos++, questionVersionId: vid } });
        versionIds.push(vid);
      }
      const res = { questionVersionIds: versionIds };
      await t.importJob.update({ where: { id: importId }, data: { status: "COMMITTED", committedAt: new Date(), result: toJson(res) } });
      await audit({ actorId: actor.userId, action: "import.committed", targetType: "import_job", targetId: importId, detail: { examId, questions: versionIds.length }, requestId }, t);
      return { ...res, alreadyCommitted: false };
    },
    { timeoutMs: 30_000 },
  );
  return result;
}

export async function discardImport(actor: Actor, importId: string, requestId: string) {
  const n = await db.importJob.updateMany({ where: { id: importId, status: "STAGED" }, data: { status: "DISCARDED" } });
  if (n.count) await audit({ actorId: actor.userId, action: "import.discarded", targetType: "import_job", targetId: importId, requestId });
}

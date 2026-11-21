import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { QUESTION_CSV_COLUMNS, type StagedRow } from "./question-csv";

/**
 * Schemas for import-job JSON columns. Everything read back from JSONB is parsed (fail fast on
 * corruption) instead of being cast.
 */
const cols = Object.fromEntries(QUESTION_CSV_COLUMNS.map((c) => [c, z.string().max(8000)])) as Record<(typeof QUESTION_CSV_COLUMNS)[number], z.ZodString>;
export const stagedRowSchema: z.ZodType<StagedRow> = z.object({ rowNumber: z.number().int().min(1), ...cols });

const issue = z.object({
  rowNumber: z.number().int(),
  column: z.enum(QUESTION_CSV_COLUMNS).nullable(),
  severity: z.enum(["error", "warning"]),
  field: z.string(),
  message: z.string(),
});

export const reportSchema = z.object({
  fileIssues: z.array(issue),
  rowIssues: z.array(issue),
  validRows: z.number().int(),
  totalRows: z.number().int(),
  duplicateOf: z.object({ importId: z.string(), committedAt: z.string() }).nullable(),
});

export const resultSchema = z.object({ questionVersionIds: z.array(z.string().uuid()) });

/** Serialise a plain JSON-safe value for a Prisma Json column (single, documented conversion point). */
export function toJson(v: object): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

/** Admin edits to staged rows (request body). */
export const editRowsBody = z.object({ rows: z.array(stagedRowSchema).max(5000), removeRowNumbers: z.array(z.number().int()).max(5000).default([]) });

/**
 * Question CSV format (R3.8–R3.10). Importer boundary: `parseQuestionCsv(bytes)` → staged rows;
 * `validateStagedRows(rows, media)` → per-row issues + normalised question inputs.
 * A future XLSX/QTI importer only needs to produce the same `StagedRow[]`.
 */
import { parse } from "csv-parse/sync";
import {
  LIMITS,
  checkQuestionContent,
  parseCorrectOption,
  parseMarks,
  questionInputSchema,
  type Issue,
  type MediaFact,
  type QuestionInput,
} from "../authoring/question-validation";

export const QUESTION_CSV_COLUMNS = [
  "external_id",
  "type",
  "question_text",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_option",
  "marks",
  "explanation",
  "topic",
  "difficulty",
  "question_image_ref",
  "option_a_image_ref",
  "option_b_image_ref",
  "option_c_image_ref",
  "option_d_image_ref",
] as const;
export type Column = (typeof QUESTION_CSV_COLUMNS)[number];

/** One CSV record as editable strings (exactly what the admin sees in the staging preview). */
export type StagedRow = { rowNumber: number } & Record<Column, string>;

export interface RowIssue extends Issue {
  rowNumber: number;
  column: Column | null;
}

export interface ParseResult {
  rows: StagedRow[];
  fileIssues: RowIssue[];
}

export function parseQuestionCsv(bytes: Uint8Array, maxRows: number): ParseResult {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fileError("The file is not valid UTF-8. Save it as 'CSV UTF-8' and try again.");
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (!text.trim()) return fileError("The file is empty.");

  let records: string[][];
  try {
    records = parse(text, { relax_column_count: true, skip_empty_lines: true, bom: false }) as string[][];
  } catch (e) {
    const err = e as { message?: string; lines?: number };
    return fileError(`CSV format error${err.lines ? ` near line ${err.lines}` : ""}: ${(err.message ?? "").replace(/^Invalid /, "invalid ")}`, err.lines ?? 0);
  }
  const [header, ...data] = records;
  const norm = (header ?? []).map((h) => h.trim().toLowerCase());
  const missing = QUESTION_CSV_COLUMNS.filter((c) => !norm.includes(c));
  const unknown = norm.filter((h) => h && !(QUESTION_CSV_COLUMNS as readonly string[]).includes(h));
  const dup = norm.filter((h, i) => h && norm.indexOf(h) !== i);
  const issues: RowIssue[] = [];
  if (missing.length) issues.push(fi(1, `Missing column(s): ${missing.join(", ")}. Download the template for the exact header.`));
  if (unknown.length) issues.push(fi(1, `Unknown column(s): ${unknown.join(", ")}.`));
  if (dup.length) issues.push(fi(1, `Duplicate column(s): ${[...new Set(dup)].join(", ")}.`));
  if (issues.length) return { rows: [], fileIssues: issues };
  if (data.length === 0) return fileError("The file has a header but no question rows.");
  if (data.length > maxRows) return fileError(`Too many rows: ${data.length}. The limit is ${maxRows} per import.`);

  const rows: StagedRow[] = data.map((rec, i) => {
    const row = { rowNumber: i + 2 } as StagedRow;
    QUESTION_CSV_COLUMNS.forEach((c) => {
      row[c] = rec[norm.indexOf(c)] ?? "";
    });
    if (rec.length !== norm.length)
      issues.push({ rowNumber: i + 2, column: null, severity: "error", field: "row", message: `Row has ${rec.length} cells; expected ${norm.length}. Check quotes around text containing commas.` });
    return row;
  });
  return { rows, fileIssues: issues };
}

function fi(rowNumber: number, message: string): RowIssue {
  return { rowNumber, column: null, severity: "error", field: "file", message };
}
function fileError(message: string, line = 0): ParseResult {
  return { rows: [], fileIssues: [fi(line, message)] };
}

export interface ValidatedRow {
  rowNumber: number;
  externalId: string;
  input: QuestionInput | null;
  issues: RowIssue[];
}

const OPTION_COLS = ["option_a", "option_b", "option_c", "option_d"] as const;
const OPTION_IMG_COLS = ["option_a_image_ref", "option_b_image_ref", "option_c_image_ref", "option_d_image_ref"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate staged rows (also after admin edits). Invalid rows are reported, never dropped. */
export function validateStagedRows(rows: readonly StagedRow[], media: ReadonlyMap<string, MediaFact>): ValidatedRow[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = r.external_id.trim();
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return rows.map((r) => {
    const issues: RowIssue[] = [];
    const add = (column: Column | null, message: string, severity: "error" | "warning" = "error") =>
      issues.push({ rowNumber: r.rowNumber, column, severity, field: column ?? "row", message });

    const externalId = r.external_id.trim();
    if (!externalId) add("external_id", "external_id is required.");
    else if (!/^[A-Za-z0-9_.-]+$/.test(externalId) || externalId.length > LIMITS.externalId)
      add("external_id", "external_id may contain only letters, digits, '-', '_' and '.' (max 64).");
    else if ((counts.get(externalId) ?? 0) > 1) add("external_id", `external_id "${externalId}" appears more than once in this file.`);

    const type = r.type.trim().toUpperCase() || "SINGLE_CHOICE";
    if (type !== "SINGLE_CHOICE") add("type", `Unsupported type "${r.type.trim()}". Only SINGLE_CHOICE is supported.`);

    const ref = (col: Column): string | null => {
      const v = r[col].trim();
      if (!v) return null;
      if (!UUID.test(v)) {
        add(col, "Image reference must be a media ID copied from the Media library (URLs are not accepted).");
        return null;
      }
      return v.toLowerCase();
    };
    const correctIndex = parseCorrectOption(r.correct_option);
    if (correctIndex === null) add("correct_option", `correct_option must be A, B, C or D (got "${r.correct_option.trim()}").`);
    const marks = parseMarks(r.marks);
    if (marks === null) add("marks", `marks must be a whole number from 1 to ${LIMITS.marksMax} (got "${r.marks.trim()}").`);

    const candidate = {
      stem: r.question_text.trim(),
      stemMediaId: ref("question_image_ref"),
      options: OPTION_COLS.map((c, i) => ({ text: r[c].trim() || null, mediaId: ref(OPTION_IMG_COLS[i]!) })),
      correctIndex: correctIndex ?? 0,
      marks: marks ?? 1,
      explanation: r.explanation.trim() || null,
      topic: r.topic.trim() || null,
      difficulty: r.difficulty.trim() || null,
    };
    const shape = questionInputSchema.safeParse(candidate);
    if (!shape.success) {
      for (const i of shape.error.issues) add(columnFor(i.path), lengthMessage(i.path, i.message));
    } else {
      for (const i of checkQuestionContent(shape.data, media))
        add(columnFor(i.field.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p))), i.message, i.severity);
    }
    const hasError = issues.some((i) => i.severity === "error");
    return { rowNumber: r.rowNumber, externalId, input: hasError || !shape.success ? null : shape.data, issues };
  });
}

function columnFor(path: readonly PropertyKey[]): Column | null {
  const [a, b, c] = path;
  if (a === "stem") return "question_text";
  if (a === "stemMediaId") return "question_image_ref";
  if (a === "options" && typeof b === "number") return c === "mediaId" ? (OPTION_IMG_COLS[b] ?? null) : (OPTION_COLS[b] ?? null);
  if (a === "explanation" || a === "topic" || a === "difficulty") return a;
  return null;
}

function lengthMessage(path: readonly PropertyKey[], fallback: string): string {
  const [a] = path;
  if (a === "stem") return `Question text is too long (max ${LIMITS.stem} characters).`;
  if (a === "options") return `Option text is too long (max ${LIMITS.option} characters).`;
  if (a === "explanation") return `Explanation is too long (max ${LIMITS.explanation} characters).`;
  return fallback;
}

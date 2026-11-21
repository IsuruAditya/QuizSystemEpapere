/**
 * Single source of truth for question content rules (R3.7). Used by the manual editor, the CSV
 * importer and publication. Pure: media facts are passed in.
 */
import { z } from "zod";

export const LIMITS = { stem: 4000, option: 1000, explanation: 4000, topic: 100, difficulty: 30, externalId: 64, marksMax: 100 } as const;
export const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

const optText = z.string().max(LIMITS.option).nullish();
const mediaId = z.string().uuid().nullish();

export const questionInputSchema = z.object({
  stem: z.string().max(LIMITS.stem).default(""),
  stemMediaId: mediaId,
  options: z.array(z.object({ text: optText, mediaId })).length(4),
  correctIndex: z.number().int().min(0).max(3),
  marks: z.number().int().min(1).max(LIMITS.marksMax),
  explanation: z.string().max(LIMITS.explanation).nullish(),
  topic: z.string().max(LIMITS.topic).nullish(),
  difficulty: z.string().max(LIMITS.difficulty).nullish(),
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

export interface MediaFact {
  kind: string;
  altText: string | null;
}

export interface Issue {
  severity: "error" | "warning";
  field: string;
  message: string;
}

const clean = (s: string | null | undefined) => (s ?? "").trim();

/** Content checks beyond shape: representation present, media valid, alt text, suspicious duplicates. */
export function checkQuestionContent(q: QuestionInput, media: ReadonlyMap<string, MediaFact>): Issue[] {
  const issues: Issue[] = [];
  const rep = (field: string, text: string | null | undefined, mid: string | null | undefined, label: string) => {
    if (!clean(text) && !mid) issues.push({ severity: "error", field, message: `${label} needs text or an image.` });
    if (mid) {
      const m = media.get(mid);
      if (!m) issues.push({ severity: "error", field, message: `${label} image reference was not found.` });
      else if (m.kind !== "QUESTION_IMAGE") issues.push({ severity: "error", field, message: `${label} image must be a question image.` });
      else if (!clean(text) && !clean(m.altText))
        issues.push({ severity: "error", field, message: `${label} is image-only; the image needs alternative text.` });
    }
  };
  rep("stem", q.stem, q.stemMediaId, "Question");
  q.options.forEach((o, i) => rep(`options.${i}`, o.text, o.mediaId, `Option ${OPTION_LETTERS[i]}`));

  const seen = new Map<string, number>();
  q.options.forEach((o, i) => {
    const key = `${clean(o.text).toLowerCase()}|${o.mediaId ?? ""}`;
    if (key === "|") return;
    const prev = seen.get(key);
    if (prev !== undefined)
      issues.push({ severity: "warning", field: `options.${i}`, message: `Option ${OPTION_LETTERS[i]} is identical to option ${OPTION_LETTERS[prev]}.` });
    else seen.set(key, i);
  });
  return issues;
}

/** Strict A–D parsing after trimming/upper-casing; never truthiness or numeric indices. */
export function parseCorrectOption(raw: string): number | null {
  const v = raw.trim().toUpperCase();
  const i = (OPTION_LETTERS as readonly string[]).indexOf(v);
  return i >= 0 ? i : null;
}

/** Strict positive integer marks ("1", " 2 "); rejects "1.5", "0", "-1", "1e1", "". */
export function parseMarks(raw: string): number | null {
  const v = raw.trim();
  if (!/^\d{1,3}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= LIMITS.marksMax ? n : null;
}

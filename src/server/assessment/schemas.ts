import { z } from "zod";

/** Attempt request contracts (no database access). */
export const answerChange = z.object({ examQuestionId: z.string().uuid(), optionId: z.string().uuid().nullable() });
export const saveBody = z.object({
  mutationId: z.string().uuid(),
  baseRevision: z.number().int().min(0),
  controllerToken: z.string().uuid(),
  changes: z.array(answerChange).min(1).max(200),
});
export const submitBody = z.object({
  mutationId: z.string().uuid(),
  baseRevision: z.number().int().min(0),
  controllerToken: z.string().uuid(),
  finalChanges: z.array(answerChange).max(200).default([]),
});
export type SaveBody = z.infer<typeof saveBody>;
export type SubmitBody = z.infer<typeof submitBody>;

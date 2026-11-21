import { z } from "zod";

/** Results administration request schemas (no database access). */
export const voidBody = z.object({ reason: z.string().trim().min(5).max(500), grantReplacement: z.boolean(), adminPassword: z.string().min(1).max(128) });

export const correctionBody = z.object({
  reason: z.string().trim().min(5).max(500),
  adminPassword: z.string().min(1).max(128),
  changes: z.array(z.object({ examQuestionId: z.string().uuid(), correctOptionId: z.string().uuid() })).min(1).max(500),
});

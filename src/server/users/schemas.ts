import { z } from "zod";
import { EP_ID_PATTERN } from "@/lib/identifiers";
import { normalizePhone } from "@/lib/phone";

/** Student account request schemas (no database access). */
const epId = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .refine((s) => EP_ID_PATTERN.test(s), "EP ID must look like EP12345 (EP followed by 3–15 letters/digits).");
const phone = z
  .string()
  .trim()
  .transform((s, ctx) => {
    if (!s) return null;
    const r = normalizePhone(s);
    if (!r.ok) {
      ctx.addIssue({ code: "custom", message: r.message });
      return z.NEVER;
    }
    return r.e164;
  });

export const studentInput = z.object({
  epId,
  fullName: z.string().trim().min(2).max(120),
  displayName: z.string().trim().min(2).max(40),
  gradeId: z.string().uuid(),
  whatsapp: phone.default(""),
  school: z.string().trim().max(120).nullish(),
  district: z.string().trim().max(60).nullish(),
});
export type StudentInput = z.infer<typeof studentInput>;
export const studentUpdate = studentInput.omit({ epId: true });

export const studentCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("disable") }),
  z.object({ action: z.literal("enable") }),
  z.object({ action: z.literal("reset-password"), adminPassword: z.string().min(1).max(128) }),
  z.object({ action: z.literal("pseudonymise"), adminPassword: z.string().min(1).max(128) }),
]);
export type StudentCommand = z.infer<typeof studentCommand>;

import { z } from "zod";

/**
 * Request schemas that are not owned by a single service module. Route handlers validate with these
 * and the OpenAPI document is generated from them (one authoritative definition; §23.4).
 */
export const loginBody = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(128), returnTo: z.string().max(300).optional() });
export const passwordBody = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(8).max(128) });
export const startBody = z.object({ takeover: z.boolean().default(true) });
export const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) });
export const questionSearchQuery = z.object({ search: z.string().max(100).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
export const draftQuestionsBody = z.object({ questionVersionIds: z.array(z.string().uuid()).max(500) });
export const exportQuery = z.object({ includeVoided: z.enum(["0", "1"]).default("1") });
export const importCommand = z.discriminatedUnion("action", [z.object({ action: z.literal("commit"), allowDuplicate: z.boolean().default(false) }), z.object({ action: z.literal("discard") })]);
export const catalogBody = z.object({ id: z.string().uuid().nullish(), data: z.unknown() });
export const mediaAltBody = z.object({ id: z.string().uuid(), altText: z.string().max(500) });

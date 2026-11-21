import "server-only";
import { z } from "zod";
import { db } from "../db";
import { AppError } from "../http/app-error";
import { audit } from "../platform/audit";
import type { Actor } from "../auth/actor";

export const gradeBody = z.object({ level: z.number().int().min(1).max(13), nameSi: z.string().trim().min(1).max(60), nameEn: z.string().trim().min(1).max(60), active: z.boolean().default(true) });
export const subjectBody = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,16}$/), nameSi: z.string().trim().min(1).max(60), nameEn: z.string().trim().min(1).max(60), active: z.boolean().default(true) });
export const teacherBody = z.object({ name: z.string().trim().min(2).max(120), bio: z.string().trim().max(1000).nullish(), photoMediaId: z.string().uuid().nullish(), active: z.boolean().default(true) });
export const brandingBody = z.object({ instituteName: z.string().trim().min(2).max(120), tagline: z.string().trim().max(200).default("") });

export async function listCatalog() {
  const [grades, subjects, teachers] = await Promise.all([
    db.grade.findMany({ orderBy: { level: "asc" } }),
    db.subject.findMany({ orderBy: { code: "asc" } }),
    db.teacher.findMany({ orderBy: { name: "asc" } }),
  ]);
  return { grades, subjects, teachers };
}

export const catalogKind = z.enum(["grade", "subject", "teacher", "branding"]);
type Kind = "grade" | "subject" | "teacher";

/** Save one catalog record or the branding setting; `raw` is validated per kind (fail fast). */
export async function saveCatalogRecord(actor: Actor, kind: z.infer<typeof catalogKind>, id: string | null, raw: unknown, requestId: string): Promise<{ ok: true; id?: string }> {
  if (kind === "branding") {
    await setBranding(actor, brandingBody.parse(raw), requestId);
    return { ok: true };
  }
  return { ok: true, id: (await upsertCatalog(actor, kind, id, raw, requestId)).id };
}

export async function upsertCatalog(actor: Actor, kind: Kind, id: string | null, raw: unknown, requestId: string) {
  let rec: { id: string };
  try {
    if (kind === "grade") {
      const d = gradeBody.parse(raw);
      rec = id ? await db.grade.update({ where: { id }, data: d }) : await db.grade.create({ data: d });
    } else if (kind === "subject") {
      const d = subjectBody.parse(raw);
      rec = id ? await db.subject.update({ where: { id }, data: d }) : await db.subject.create({ data: d });
    } else {
      const d = teacherBody.parse(raw);
      if (d.photoMediaId) {
        const m = await db.media.findUnique({ where: { id: d.photoMediaId }, select: { kind: true } });
        if (m?.kind !== "TEACHER_PHOTO") throw new AppError("VALIDATION_ERROR", "Choose an uploaded teacher photo.", { errors: [{ path: "photoMediaId", message: "Invalid photo." }] });
      }
      const data = { name: d.name, bio: d.bio ?? null, photoMediaId: d.photoMediaId ?? null, active: d.active };
      rec = id ? await db.teacher.update({ where: { id }, data }) : await db.teacher.create({ data });
    }
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new AppError("CONFLICT", "That value already exists.");
    throw e;
  }
  await audit({ actorId: actor.userId, action: `catalog.${kind}.${id ? "updated" : "created"}`, targetType: kind, targetId: rec.id, requestId });
  return rec;
}

export async function getBranding(): Promise<z.infer<typeof brandingBody>> {
  const s = await db.appSetting.findUnique({ where: { key: "branding" } });
  const p = brandingBody.safeParse(s?.value);
  return p.success ? p.data : { instituteName: "e-Paperé Online Institute", tagline: "" };
}

export async function setBranding(actor: Actor, v: z.infer<typeof brandingBody>, requestId: string) {
  await db.appSetting.upsert({ where: { key: "branding" }, create: { key: "branding", value: v }, update: { value: v } });
  await audit({ actorId: actor.userId, action: "settings.branding", targetType: "app_setting", targetId: "branding", requestId });
}

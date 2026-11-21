import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "../db";
import { env } from "../env";
import { AppError } from "../http/app-error";
import { audit } from "../platform/audit";
import type { Actor } from "../auth/actor";
import { checkImage } from "./image-check";
import { mediaStore, type MediaStore } from "./storage";

export type MediaKind = "TEACHER_PHOTO" | "EXAM_COVER" | "QUESTION_IMAGE";

/**
 * Upload: validate bytes first, write to storage (no DB transaction open during the network call),
 * then insert the record. Orphaned objects from a failed insert are harmless (unreferenced, private).
 */
export interface UploadInput {
  kind: MediaKind;
  bytes: Uint8Array;
  originalName: string;
  altText: string | null;
}

export async function uploadMedia(actor: Actor, input: UploadInput, requestId: string, store: MediaStore = mediaStore()) {
  const c = checkImage(input.bytes, env().MEDIA_MAX_BYTES);
  if (!c.ok) throw new AppError("UNSUPPORTED_MEDIA", c.message);
  const id = randomUUID();
  const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[c.type];
  const key = `media/${input.kind.toLowerCase()}/${id}.${ext}`;
  await store.put(key, input.bytes, c.type);
  const m = await db.media.create({
    data: {
      id,
      kind: input.kind,
      contentType: c.type,
      byteSize: input.bytes.byteLength,
      width: c.width,
      height: c.height,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
      storageKey: key,
      altText: input.altText?.trim() || null,
      originalName: input.originalName.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 120) || null,
      uploadedById: actor.userId,
    },
    select: { id: true, kind: true, width: true, height: true, altText: true, contentType: true, byteSize: true },
  });
  await audit({ actorId: actor.userId, action: "media.uploaded", targetType: "media", targetId: id, detail: { kind: input.kind }, requestId });
  return m;
}

export async function setAltText(actor: Actor, id: string, altText: string, requestId: string) {
  await db.media.update({ where: { id }, data: { altText: altText.trim() || null } });
  await audit({ actorId: actor.userId, action: "media.alt_updated", targetType: "media", targetId: id, requestId });
}

/**
 * Authorisation for delivery (R3.14):
 * - admins: everything;
 * - teacher photos / exam covers: public (portraits shown on landing pages);
 * - question images: only students holding an attempt on an exam version that uses the image.
 */
interface ViewDecision {
  allowed: boolean;
  publicAsset: boolean;
  key: string;
  contentType: string;
}

export async function canView(id: string, actor: Pick<Actor, "userId" | "role"> | null): Promise<ViewDecision | null> {
  const m = await db.media.findUnique({ where: { id }, select: { kind: true, storageKey: true, contentType: true } });
  if (!m) return null;
  const base = { key: m.storageKey, contentType: m.contentType };
  if (m.kind !== "QUESTION_IMAGE") return { ...base, allowed: true, publicAsset: true };
  if (!actor) return { ...base, allowed: false, publicAsset: false };
  if (actor.role === "ADMIN") return { ...base, allowed: true, publicAsset: false };
  const r = await db.$queryRaw<{ ok: number }[]>`
    SELECT 1 AS ok FROM attempt a
    JOIN exam_question eq ON eq.exam_version_id = a.exam_version_id
    JOIN question_version qv ON qv.id = eq.question_version_id
    LEFT JOIN question_option qo ON qo.question_version_id = qv.id
    WHERE a.user_id = ${actor.userId} AND (qv.stem_media_id = ${id}::uuid OR qo.media_id = ${id}::uuid)
    LIMIT 1`;
  return { ...base, allowed: r.length > 0, publicAsset: false };
}

export interface DeliverableMedia {
  bytes: Uint8Array;
  contentType: string;
  publicAsset: boolean;
}

/** Delivery use case: authorise, then read. Unauthorised and missing look identical (null ? 404). */
export async function getMediaForDelivery(id: string, actor: Pick<Actor, "userId" | "role"> | null, store: MediaStore = mediaStore()): Promise<DeliverableMedia | null> {
  const v = await canView(id, actor);
  if (!v?.allowed) return null;
  const bytes = await store.get(v.key);
  return bytes ? { bytes, contentType: v.contentType, publicAsset: v.publicAsset } : null;
}

export async function listMedia(kind: MediaKind | undefined, page: number, pageSize: number) {
  const where = kind ? { kind } : {};
  const [total, items] = await Promise.all([
    db.media.count({ where }),
    db.media.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, kind: true, altText: true, width: true, height: true, originalName: true, createdAt: true } }),
  ]);
  return { total, items };
}

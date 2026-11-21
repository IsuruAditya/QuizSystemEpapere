import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "../db";

export interface AuditInput {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  detail?: Prisma.InputJsonValue;
  requestId?: string;
}

/** Append an audit event. Pass `t` to write inside the caller's transaction (preferred for state changes). */
export async function audit(e: AuditInput, t?: Tx): Promise<void> {
  await (t ?? db).auditEvent.create({
    data: {
      actorId: e.actorId,
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId,
      detail: e.detail ?? {},
      requestId: e.requestId ?? null,
    },
  });
}

"use client";
import { z } from "zod";
import { api, ApiError } from "../api-client";
import type { AttemptView } from "../attempt/types";
import type { Batch, Change, TransportResult } from "../attempt/sync-queue";

/** Typed client calls for the student journey. Components never call fetch directly. */

export const authApi = {
  login: (username: string, password: string, returnTo: string) => api<{ next: string }>("/api/v1/auth/login", { body: { username, password, returnTo } }),
  changePassword: (currentPassword: string, newPassword: string) => api<{ ok: true }>("/api/v1/auth/password", { body: { currentPassword, newPassword } }),
  logout: () => api<{ ok: true }>("/api/v1/auth/logout", { method: "POST" }),
};

export interface StartResponse {
  attemptId: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "GRADED";
  created: boolean;
  controllerToken: string | null;
}

/** Validates the server's conflict payload at the client boundary instead of casting it. */
const conflictPayload = z.object({ revision: z.number().int().min(0), answers: z.record(z.string(), z.string().nullable()) });
export type CanonicalState = z.infer<typeof conflictPayload>;

export function conflictState(e: ApiError): CanonicalState {
  const p = conflictPayload.safeParse(e.problem);
  return p.success ? p.data : { revision: 0, answers: {} };
}

export const attemptApi = {
  start: (slug: string) => api<StartResponse>(`/api/v1/exams/${encodeURIComponent(slug)}/attempts`, { body: { takeover: true } }),
  get: (attemptId: string) => api<AttemptView>(`/api/v1/attempts/${attemptId}`),
  takeover: (attemptId: string) => api<{ controllerToken: string } & CanonicalState>(`/api/v1/attempts/${attemptId}/controller`, { method: "POST" }),
  submit: (attemptId: string, body: { mutationId: string; baseRevision: number; controllerToken: string; finalChanges: Change[] }) =>
    api<{ attemptId: string; appliedFinalChanges: boolean }>(`/api/v1/attempts/${attemptId}/submit`, { body, timeoutMs: 20_000 }),
};

/** Sync-queue transport: maps HTTP outcomes to the queue's result contract. */
export async function sendBatch(attemptId: string, token: string, b: Batch): Promise<TransportResult> {
  try {
    const r = await api<{ revision: number; serverTime: string }>(`/api/v1/attempts/${attemptId}/answers`, {
      method: "PUT",
      body: { mutationId: b.mutationId, baseRevision: b.baseRevision, controllerToken: token, changes: b.changes },
      timeoutMs: 15_000,
    });
    return { ok: true, revision: r.revision, serverTime: r.serverTime };
  } catch (e) {
    if (!(e instanceof ApiError)) return { ok: false, kind: "transient" };
    switch (e.code) {
      case "REVISION_CONFLICT":
        return { ok: false, kind: "conflict", ...conflictState(e) };
      case "CONTROLLER_CHANGED":
        return { ok: false, kind: "controller" };
      case "ATTEMPT_FINALIZED":
      case "NOT_FOUND":
        return { ok: false, kind: "finalized" };
      case "INVALID_OPTION":
      case "VALIDATION_ERROR":
        return { ok: false, kind: "permanent" };
      case "UNAUTHENTICATED":
      case "PASSWORD_CHANGE_REQUIRED":
        return { ok: false, kind: "transient", retryAfterSeconds: 10 };
      default:
        return { ok: false, kind: "transient", retryAfterSeconds: e.retryAfterSeconds, offline: e.status === 0 && typeof navigator !== "undefined" && !navigator.onLine };
    }
  }
}

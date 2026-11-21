"use client";
import type { ErrorCode, ProblemDetails } from "./errors";

/** Error thrown by `api()` with the server's stable code (status 0 = network failure). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "NETWORK",
    message: string,
    readonly problem: ProblemDetails | null,
    readonly retryAfterSeconds: number | null,
  ) {
    super(message);
  }
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of this.problem?.errors ?? []) out[e.path] ??= e.message;
    return out;
  }
}

/** Normalise anything thrown by `api()` (or unexpected code) into an ApiError. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  return new ApiError(0, "INTERNAL", e instanceof Error ? e.message : "Unexpected error", null, null);
}

/** Same-origin JSON fetch. Cookies are sent automatically; nothing is stored in localStorage. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20_000);
  init.signal?.addEventListener("abort", () => ctrl.abort());
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body || init.form ? "POST" : "GET"),
      headers: init.form ? undefined : init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
      credentials: "same-origin",
      cache: "no-store",
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Network error", null, null);
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) {
    const ct = res.headers.get("content-type") ?? "";
    return (ct.includes("json") ? await res.json() : await res.text()) as T;
  }
  let problem: ProblemDetails | null = null;
  try {
    problem = (await res.json()) as ProblemDetails;
  } catch {
    /* not JSON */
  }
  const ra = Number(res.headers.get("retry-after"));
  throw new ApiError(res.status, problem?.code ?? (res.status >= 500 ? "TEMPORARY_FAILURE" : "INTERNAL"), problem?.title ?? res.statusText, problem, Number.isFinite(ra) && ra > 0 ? ra : null);
}

import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import type { ProblemDetails } from "@/lib/errors";
import { allowedOrigins, env } from "../env";
import { resolveActor, type Actor } from "../auth/actor";
import { logger } from "../platform/logger";
import { AppError } from "./app-error";

type AuthMode = "public" | "any" | "student" | "admin" | "cron";

interface Options<B extends ZodType | undefined, Q extends ZodType | undefined, P extends ZodType | undefined> {
  auth: AuthMode;
  body?: B;
  query?: Q;
  /** Path segment schema. Invalid params fail fast with 404 before any service call. */
  params?: P;
  /** Max JSON body bytes (default 64 KiB). Multipart routes read the body themselves. */
  maxBytes?: number;
  /** Allow users who must change their password (only the password-change route). */
  allowPasswordChange?: boolean;
  /** Raw body handling (e.g. multipart uploads): skip JSON parsing. */
  rawBody?: boolean;
}

export interface Ctx<A extends AuthMode, B, Q, P> {
  req: NextRequest;
  requestId: string;
  actor: A extends "public" | "cron" ? Actor | null : Actor;
  body: B;
  query: Q;
  params: P;
  ip: string;
}

type Infer<T> = T extends ZodType ? z.infer<T> : undefined;
type InferParams<T> = T extends ZodType ? z.infer<T> : Record<string, string>;

/** Common path-parameter schemas. */
export const idParams = z.object({ id: z.string().uuid() });
export const slugParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{3,80}$/) });

/**
 * Thin route wrapper: request id, origin check for mutations, size limit, authentication and
 * role guard, Zod validation, RFC 9457 problem details, no-store caching.
 */
export function withRoute<
  A extends AuthMode,
  B extends ZodType | undefined = undefined,
  Q extends ZodType | undefined = undefined,
  P extends ZodType | undefined = undefined,
>(opts: Options<B, Q, P> & { auth: A }, handler: (ctx: Ctx<A, Infer<B>, Infer<Q>, InferParams<P>>) => Promise<unknown>) {
  return async (req: NextRequest, segment: { params: Promise<Record<string, string | string[]>> }): Promise<Response> => {
    const requestId = req.headers.get("x-request-id")?.slice(0, 64) || randomUUID();
    const started = performance.now();
    try {
      const method = req.method.toUpperCase();
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(method);
      if (mutating && opts.auth !== "cron") checkOrigin(req);

      let actor: Actor | null = null;
      if (opts.auth === "cron") {
        checkCron(req);
      } else {
        actor = await resolveActor(req.headers);
        if (opts.auth !== "public") {
          if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in.");
          if (actor.mustChangePassword && !opts.allowPasswordChange)
            throw new AppError("PASSWORD_CHANGE_REQUIRED", "You must change your password before continuing.");
          if (opts.auth === "admin" && actor.role !== "ADMIN") throw new AppError("ACCESS_DENIED", "Administrator access required.");
          if (opts.auth === "student" && actor.role !== "STUDENT") throw new AppError("ACCESS_DENIED", "Student access required.");
        }
      }

      let body: unknown = undefined;
      if (opts.body && !opts.rawBody) body = opts.body.parse(await readJson(req, opts.maxBytes ?? 65_536));
      let query: unknown = undefined;
      if (opts.query) query = opts.query.parse(Object.fromEntries(req.nextUrl.searchParams));
      const raw = await segment.params;
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw ?? {})) flat[k] = Array.isArray(v) ? v.join("/") : v;
      let params: unknown = flat;
      if (opts.params) {
        const parsed = opts.params.safeParse(flat);
        if (!parsed.success) throw new AppError("NOT_FOUND", "Not found.");
        params = parsed.data;
      }

      const result = await handler({
        req,
        requestId,
        actor: actor as Ctx<A, Infer<B>, Infer<Q>, InferParams<P>>["actor"],
        body: body as Infer<B>,
        query: query as Infer<Q>,
        params: params as InferParams<P>,
        ip: clientIp(req),
      });
      const res = result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
      finish(res, requestId);
      logger.debug("request", { requestId, method, path: req.nextUrl.pathname, status: res.status, ms: Math.round(performance.now() - started) });
      return res;
    } catch (err) {
      const res = toProblem(err, requestId, req);
      finish(res, requestId);
      return res;
    }
  };
}

function finish(res: Response, requestId: string) {
  res.headers.set("X-Request-Id", requestId);
  if (!res.headers.has("Cache-Control")) res.headers.set("Cache-Control", "no-store, private");
}

function checkOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin) {
    if (!allowedOrigins().includes(origin)) throw new AppError("ACCESS_DENIED", "Cross-site request rejected.");
    return;
  }
  // No Origin header: accept only same-origin fetch metadata (modern browsers always send one of the two).
  if (req.headers.get("sec-fetch-site") !== "same-origin") throw new AppError("ACCESS_DENIED", "Cross-site request rejected.");
}

function checkCron(req: NextRequest) {
  const h = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${env().CRON_SECRET}`;
  if (h.length !== expected.length || !timingSafeEq(h, expected)) throw new AppError("UNAUTHENTICATED", "Invalid job credentials.");
}

function timingSafeEq(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function clientIp(req: NextRequest): string {
  const h = req.headers.get(env().CLIENT_IP_HEADER) ?? req.headers.get("x-forwarded-for") ?? "";
  return h.split(",")[0]?.trim() || "unknown";
}

async function readJson(req: NextRequest, maxBytes: number): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE", "Request body too large.");
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE", "Request body too large.");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Request body is not valid JSON.");
  }
}

function problem(p: ProblemDetails, retryAfter?: number): Response {
  const res = NextResponse.json(p, { status: p.status, headers: { "Content-Type": "application/problem+json" } });
  if (retryAfter) res.headers.set("Retry-After", String(retryAfter));
  return res;
}

export function toProblem(err: unknown, requestId: string, req?: NextRequest): Response {
  if (err instanceof AppError) {
    return problem(
      { type: `https://epapere.lk/problems/${err.code.toLowerCase()}`, title: err.message, status: err.status, code: err.code, requestId, ...err.extra },
      err.retryAfterSeconds,
    );
  }
  if (err instanceof ZodError) {
    return problem({
      type: "https://epapere.lk/problems/validation_error",
      title: "Some fields are invalid.",
      status: 422,
      code: "VALIDATION_ERROR",
      requestId,
      errors: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  if (isClientAbort(err)) {
    // The browser went away mid-request (navigation, closed tab, lost network). Not a server fault;
    // kept out of the database-failure signal. The response is never delivered.
    logger.info("client closed request", { requestId, path: req?.nextUrl.pathname });
    return problem({ type: "https://epapere.lk/problems/temporary_failure", title: "Request was interrupted.", status: 503, code: "TEMPORARY_FAILURE", requestId });
  }
  if (isTransientDbError(err)) {
    logger.warn("transient database failure", { requestId, path: req?.nextUrl.pathname, err });
    return problem(
      { type: "https://epapere.lk/problems/temporary_failure", title: "Temporary problem. Please retry.", status: 503, code: "TEMPORARY_FAILURE", requestId },
      2,
    );
  }
  logger.error("unhandled error", { requestId, path: req?.nextUrl.pathname, err });
  return problem({ type: "https://epapere.lk/problems/internal", title: "Unexpected error.", status: 500, code: "INTERNAL", requestId });
}

/** The incoming HTTP request was aborted by the client while its body was being read. */
export function isClientAbort(err: unknown): boolean {
  const e = err as { name?: string; message?: string; code?: string } | null;
  return e?.name === "AbortError" || (e?.message === "aborted" && (e.code === undefined || e.code === "ECONNRESET"));
}

/** Serialization failures, deadlocks, pool timeouts, connection loss → safe to retry. */
export function isTransientDbError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string } } | null;
  const code = e?.code ?? e?.cause?.code ?? "";
  if (["P2034", "P1001", "P1002", "P1017", "P2024", "P2028", "40001", "40P01", "55P03", "57014", "57P01", "08006", "08003", "ECONNRESET", "ETIMEDOUT"].includes(code))
    return true;
  const msg = e?.message ?? "";
  return /timeout exceeded when trying to connect|Connection terminated|could not serialize|deadlock detected|Transaction already closed|Unable to start a transaction|lock timeout|canceling statement due to statement timeout/i.test(msg);
}

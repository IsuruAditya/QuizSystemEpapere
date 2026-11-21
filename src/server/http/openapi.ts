import { z, type ZodType } from "zod";
import { ERROR_CODES } from "@/lib/errors";
import * as c from "./contracts";
import { saveBody, submitBody } from "../assessment/schemas";
import { examSettingsSchema } from "../authoring/exam-schema";
import { questionInputSchema } from "../authoring/question-validation";
import { editRowsBody } from "../imports/stored";
import { correctionBody, voidBody } from "../results/schemas";
import { studentCommand, studentInput, studentUpdate } from "../users/schemas";

/**
 * OpenAPI 3.1 document generated from the SAME Zod schemas the route handlers validate with.
 * `npm run openapi` writes docs/openapi.json; tests/unit/openapi.test.ts fails if it is stale or
 * if any route file is missing from it. Response schemas are described for the critical student
 * endpoints; answer keys never appear in any schema or example.
 */
type Auth = "public" | "student" | "admin" | "any" | "cron";
interface Op {
  method: "get" | "post" | "put" | "patch";
  path: string;
  summary: string;
  auth: Auth;
  body?: ZodType;
  multipart?: string[];
  query?: ZodType;
  ok?: { description: string; schema?: ZodType; contentType?: string };
  errors: (typeof ERROR_CODES)[number][];
}

const json = (s: ZodType) => z.toJSONSchema(s, { io: "input", unrepresentable: "any", target: "openapi-3.0" }) as Record<string, unknown>;

const saveAck = z.object({ revision: z.number().int(), savedAt: z.string(), serverTime: z.string(), deadlineAt: z.string().nullable(), duplicate: z.boolean() });
const startRes = z.object({ attemptId: z.string().uuid(), status: z.enum(["IN_PROGRESS", "SUBMITTED", "GRADED"]), created: z.boolean(), controllerToken: z.string().uuid().nullable() });
const option = z.object({ id: z.string().uuid(), position: z.number().int(), text: z.string().nullable(), media: z.object({ id: z.string(), alt: z.string().nullable(), width: z.number(), height: z.number() }).nullable() });
const attemptView = z.object({
  id: z.string().uuid(),
  status: z.enum(["IN_PROGRESS", "SUBMITTED", "GRADED"]),
  startedAt: z.string(),
  deadlineAt: z.string().nullable().describe("Server-assigned; null only for untimed practice"),
  serverTime: z.string(),
  revision: z.number().int(),
  questions: z.array(z.object({ examQuestionId: z.string().uuid(), position: z.number().int(), marks: z.number().int(), stem: z.string(), options: z.array(option) })).describe("Never contains correct options or explanations"),
  answers: z.record(z.string(), z.string().nullable()),
});
const receipt = z.object({
  attemptId: z.string().uuid(),
  status: z.enum(["SUBMITTED", "GRADED"]),
  submittedAt: z.string().nullable(),
  finalizeReason: z.enum(["MANUAL", "EXPIRED"]).nullable(),
  elapsedMs: z.number().int().nullable(),
  score: z.number().int().nullable().describe("null = hidden by release policy or not graded yet (see gradingState)"),
  maxScore: z.number().int().nullable(),
  gradingState: z.enum(["PENDING", "GRADED"]),
});
const leaderboard = z.object({
  total: z.number().int(),
  rows: z.array(z.object({ rank: z.number().int(), displayName: z.string(), score: z.number().int(), maxScore: z.number().int(), elapsedMs: z.number().int(), isMe: z.boolean() })),
  me: z.unknown().nullable(),
  status: z.object({ state: z.enum(["PROVISIONAL", "FINAL"]), reasons: z.array(z.string()), rankingRevision: z.number().int() }),
});

const ID = "{id}";
export const OPERATIONS: Op[] = [
  { method: "post", path: "/api/v1/auth/login", summary: "Sign in with EP ID/username and password", auth: "public", body: c.loginBody, errors: ["UNAUTHENTICATED", "RATE_LIMITED", "VALIDATION_ERROR"] },
  { method: "post", path: "/api/v1/auth/logout", summary: "Sign out (revokes the session)", auth: "public", errors: [] },
  { method: "post", path: "/api/v1/auth/password", summary: "Change own password (required after admin reset)", auth: "any", body: c.passwordBody, errors: ["UNAUTHENTICATED", "VALIDATION_ERROR"] },
  { method: "post", path: "/api/v1/exams/{slug}/attempts", summary: "Start or resume my attempt (idempotent)", auth: "student", body: c.startBody, ok: { description: "Attempt", schema: startRes }, errors: ["NOT_FOUND", "ACCESS_DENIED", "NOT_OPEN", "CLOSED", "NO_ATTEMPTS_REMAINING"] },
  { method: "get", path: "/api/v1/exams/{slug}/leaderboard", summary: "Per-exam leaderboard (this exam only)", auth: "any", query: c.pageQuery, ok: { description: "Leaderboard page", schema: leaderboard }, errors: ["NOT_FOUND", "ACCESS_DENIED"] },
  { method: "get", path: `/api/v1/attempts/${ID}`, summary: "My attempt (student-safe; no answer keys)", auth: "student", ok: { description: "Attempt view", schema: attemptView }, errors: ["NOT_FOUND"] },
  { method: "put", path: `/api/v1/attempts/${ID}/answers`, summary: "Save an answer batch (CAS on baseRevision; idempotent by mutationId)", auth: "student", body: saveBody, ok: { description: "Acknowledged revision", schema: saveAck }, errors: ["REVISION_CONFLICT", "CONTROLLER_CHANGED", "ATTEMPT_FINALIZED", "INVALID_OPTION", "NOT_FOUND"] },
  { method: "post", path: `/api/v1/attempts/${ID}/controller`, summary: "Take over as the writable tab/device", auth: "student", errors: ["ATTEMPT_FINALIZED", "NOT_FOUND"] },
  { method: "post", path: `/api/v1/attempts/${ID}/submit`, summary: "Submit (idempotent; returns the canonical receipt)", auth: "student", body: submitBody, ok: { description: "Receipt", schema: receipt }, errors: ["REVISION_CONFLICT", "CONTROLLER_CHANGED", "ATTEMPT_FINALIZED", "INVALID_OPTION", "NOT_FOUND"] },
  { method: "get", path: `/api/v1/attempts/${ID}/result`, summary: "Result and review allowed by the release policy", auth: "student", ok: { description: "Receipt and released review", schema: receipt }, errors: ["NOT_FOUND"] },
  { method: "get", path: `/api/v1/media/${ID}`, summary: "Authorised media delivery", auth: "public", ok: { description: "Image", contentType: "image/*" }, errors: ["NOT_FOUND"] },
  { method: "post", path: "/api/v1/admin/exams", summary: "Create exam", auth: "admin", body: examSettingsSchema, errors: ["VALIDATION_ERROR"] },
  { method: "put", path: `/api/v1/admin/exams/${ID}`, summary: "Update exam settings", auth: "admin", body: examSettingsSchema, errors: ["NOT_FOUND", "CONFLICT", "VALIDATION_ERROR"] },
  { method: "post", path: `/api/v1/admin/exams/${ID}/{action}`, summary: "Lifecycle command: publish | unpublish | archive | duplicate", auth: "admin", errors: ["NOT_FOUND", "CONFLICT", "VALIDATION_ERROR"] },
  { method: "get", path: `/api/v1/admin/exams/${ID}/{action}`, summary: "publish-issues: validation before publishing", auth: "admin", errors: ["NOT_FOUND"] },
  { method: "put", path: `/api/v1/admin/exams/${ID}/questions`, summary: "Set ordered draft questions", auth: "admin", body: c.draftQuestionsBody, errors: ["CONFLICT", "VALIDATION_ERROR"] },
  { method: "post", path: `/api/v1/admin/exams/${ID}/grading-corrections`, summary: "Audited answer-key correction + regrade job (password re-confirmation)", auth: "admin", body: correctionBody, errors: ["ACCESS_DENIED", "CONFLICT", "INVALID_OPTION", "VALIDATION_ERROR"] },
  { method: "get", path: `/api/v1/admin/exams/${ID}/results.csv`, summary: "Per-exam results export (formula-safe, audited)", auth: "admin", query: c.exportQuery, ok: { description: "CSV", contentType: "text/csv" }, errors: ["NOT_FOUND"] },
  { method: "post", path: `/api/v1/admin/attempts/${ID}/void`, summary: "Void an attempt (reason, optional replacement, password re-confirmation)", auth: "admin", body: voidBody, errors: ["ACCESS_DENIED", "CONFLICT", "NOT_FOUND"] },
  { method: "get", path: "/api/v1/admin/questions", summary: "Search question bank", auth: "admin", query: c.questionSearchQuery, errors: [] },
  { method: "post", path: "/api/v1/admin/questions", summary: "Create question (optionally append to a draft exam)", auth: "admin", body: z.object({ externalId: z.string().nullish(), question: questionInputSchema, addToExamId: z.string().uuid().nullish() }), errors: ["VALIDATION_ERROR", "CONFLICT"] },
  { method: "put", path: `/api/v1/admin/questions/${ID}`, summary: "Edit question (creates a new version)", auth: "admin", body: z.object({ question: questionInputSchema }), errors: ["NOT_FOUND", "VALIDATION_ERROR"] },
  { method: "post", path: "/api/v1/admin/imports", summary: "Upload and stage a question CSV for a draft exam", auth: "admin", multipart: ["file", "examId"], errors: ["PAYLOAD_TOO_LARGE", "UNSUPPORTED_MEDIA", "CONFLICT", "RATE_LIMITED"] },
  { method: "get", path: `/api/v1/admin/imports/${ID}`, summary: "Staged import with validation report", auth: "admin", errors: ["NOT_FOUND"] },
  { method: "patch", path: `/api/v1/admin/imports/${ID}`, summary: "Edit staged rows and revalidate", auth: "admin", body: editRowsBody, errors: ["CONFLICT", "VALIDATION_ERROR"] },
  { method: "post", path: `/api/v1/admin/imports/${ID}`, summary: "Commit (idempotent) or discard", auth: "admin", body: c.importCommand, errors: ["CONFLICT", "VALIDATION_ERROR"] },
  { method: "post", path: "/api/v1/admin/media", summary: "Upload image (PNG/JPEG/WebP by magic bytes)", auth: "admin", multipart: ["file", "kind", "altText"], errors: ["PAYLOAD_TOO_LARGE", "UNSUPPORTED_MEDIA"] },
  { method: "patch", path: "/api/v1/admin/media", summary: "Set alternative text", auth: "admin", body: c.mediaAltBody, errors: ["NOT_FOUND"] },
  { method: "post", path: "/api/v1/admin/students", summary: "Create student (returns one-time temporary password)", auth: "admin", body: studentInput, errors: ["CONFLICT", "VALIDATION_ERROR"] },
  { method: "put", path: `/api/v1/admin/students/${ID}`, summary: "Update student profile", auth: "admin", body: studentUpdate, errors: ["NOT_FOUND", "VALIDATION_ERROR"] },
  { method: "post", path: `/api/v1/admin/students/${ID}`, summary: "Account command: disable | enable | reset-password | pseudonymise", auth: "admin", body: studentCommand, errors: ["ACCESS_DENIED", "NOT_FOUND", "CONFLICT"] },
  { method: "post", path: "/api/v1/admin/students/bulk", summary: "Validate or commit a student registration CSV", auth: "admin", multipart: ["file", "commit"], errors: ["VALIDATION_ERROR", "PAYLOAD_TOO_LARGE"] },
  { method: "post", path: "/api/v1/admin/catalog/{kind}", summary: "Save grade | subject | teacher | branding", auth: "admin", body: c.catalogBody, errors: ["CONFLICT", "VALIDATION_ERROR"] },
  { method: "get", path: "/api/v1/admin/templates/{name}", summary: "Download a CSV template", auth: "admin", ok: { description: "CSV", contentType: "text/csv" }, errors: ["NOT_FOUND"] },
  { method: "post", path: "/api/internal/jobs/run", summary: "Scheduled job dispatcher (Bearer CRON_SECRET)", auth: "cron", errors: ["UNAUTHENTICATED"] },
  { method: "get", path: "/api/internal/jobs/run", summary: "Same as POST (Vercel Cron uses GET)", auth: "cron", errors: ["UNAUTHENTICATED"] },
];

const STATUS: Record<string, string> = { UNAUTHENTICATED: "401", ACCESS_DENIED: "403", NOT_FOUND: "404", RATE_LIMITED: "429", PAYLOAD_TOO_LARGE: "413", UNSUPPORTED_MEDIA: "415", VALIDATION_ERROR: "422", INVALID_OPTION: "422" };

export function buildOpenApi(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of OPERATIONS) {
    const params = [...op.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    if (op.query) {
      const q = json(op.query) as { properties?: Record<string, unknown>; required?: string[] };
      for (const [name, schema] of Object.entries(q.properties ?? {})) params.push({ name, in: "query", required: Boolean(q.required?.includes(name)), schema: schema as { type: string } });
    }
    const responses: Record<string, unknown> = {
      "200": op.ok?.contentType
        ? { description: op.ok.description, content: { [op.ok.contentType]: {} } }
        : { description: op.ok?.description ?? "OK", content: { "application/json": { schema: op.ok?.schema ? json(op.ok.schema) : { type: "object" } } } },
    };
    const byStatus = new Map<string, string[]>();
    for (const code of [...op.errors, "TEMPORARY_FAILURE" as const]) {
      const s = STATUS[code] ?? (code === "TEMPORARY_FAILURE" ? "503" : "409");
      byStatus.set(s, [...(byStatus.get(s) ?? []), code]);
    }
    for (const [s, codes] of byStatus) responses[s] = { description: codes.join(" | "), content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } } };
    paths[op.path] ??= {};
    paths[op.path]![op.method] = {
      summary: op.summary,
      security: op.auth === "public" ? [] : op.auth === "cron" ? [{ cronBearer: [] }] : [{ session: [] }],
      "x-auth": op.auth,
      ...(params.length ? { parameters: params } : {}),
      ...(op.body ? { requestBody: { required: true, content: { "application/json": { schema: json(op.body) } } } } : {}),
      ...(op.multipart ? { requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", properties: Object.fromEntries(op.multipart.map((f) => [f, { type: "string", ...(f === "file" ? { format: "binary" } : {}) }])) } } } } } : {}),
      responses,
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "e-Paperé Exams API",
      version: "1.0.0",
      description:
        "Same-origin JSON API. Mutations require an allowed Origin (or Sec-Fetch-Site: same-origin). Errors are RFC 9457 problem details with a stable `code` and `requestId`. Personalised responses are `Cache-Control: no-store`. Retry 503/429 with backoff honouring Retry-After. Save/submit idempotency: `mutationId` (UUID) scoped to the attempt; a repeated save mutation returns the original acknowledgement; a finalised attempt always returns its canonical receipt.",
    },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: {
        session: { type: "apiKey", in: "cookie", name: "ep.session_token", description: "HttpOnly database session cookie set by /api/v1/auth/login" },
        cronBearer: { type: "http", scheme: "bearer", description: "CRON_SECRET" },
      },
      schemas: {
        Problem: {
          type: "object",
          required: ["type", "title", "status", "code"],
          properties: {
            type: { type: "string" },
            title: { type: "string" },
            status: { type: "integer" },
            code: { type: "string", enum: [...ERROR_CODES] },
            requestId: { type: "string" },
            errors: { type: "array", items: { type: "object", properties: { path: { type: "string" }, message: { type: "string" } } } },
          },
        },
      },
    },
    paths,
  };
}

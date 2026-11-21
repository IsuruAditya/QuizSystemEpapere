import "server-only";
import { z } from "zod";

const schema = z
  .object({
    APP_ENV: z.enum(["local", "test", "preview", "production"]).default("local"),
    DATABASE_URL: z.string().url("DATABASE_URL must be a postgresql:// URL"),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    APP_ORIGIN: z.string().url("APP_ORIGIN must be the public origin, e.g. https://exams.example.lk"),
    APP_EXTRA_ORIGINS: z.string().default(""),
    CRON_SECRET: z.string().min(32, "CRON_SECRET must be at least 32 characters"),
    MEDIA_STORE: z.enum(["local", "vercel-blob"]).default("local"),
    MEDIA_LOCAL_DIR: z.string().default(".local-media"),
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
    IMPORT_MAX_BYTES: z.coerce.number().int().positive().max(4_000_000).default(1_048_576),
    IMPORT_MAX_ROWS: z.coerce.number().int().positive().max(5000).default(500),
    MEDIA_MAX_BYTES: z.coerce.number().int().positive().max(4_000_000).default(2_097_152),
    CLIENT_IP_HEADER: z.string().default("x-real-ip"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .superRefine((v, ctx) => {
    if (v.MEDIA_STORE === "vercel-blob" && !v.BLOB_READ_WRITE_TOKEN)
      ctx.addIssue({ code: "custom", path: ["BLOB_READ_WRITE_TOKEN"], message: "required when MEDIA_STORE=vercel-blob" });
    if ((v.APP_ENV === "production" || v.APP_ENV === "preview") && v.MEDIA_STORE === "local")
      ctx.addIssue({ code: "custom", path: ["MEDIA_STORE"], message: "local media store is not allowed in preview/production" });
    if (v.APP_ENV === "production" && !v.APP_ORIGIN.startsWith("https://"))
      ctx.addIssue({ code: "custom", path: ["APP_ORIGIN"], message: "production origin must be https" });
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated server environment. Throws an actionable error listing every invalid variable. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration (see .env.example):\n${lines.join("\n")}`);
  }
  cached = parsed.data;
  return cached;
}

export function allowedOrigins(): string[] {
  const e = env();
  return [e.APP_ORIGIN, ...e.APP_EXTRA_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)].map((o) =>
    new URL(o).origin,
  );
}

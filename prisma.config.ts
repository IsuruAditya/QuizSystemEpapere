import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Load local .env if present (Node >= 21 built-in; CI/Vercel provide real env vars).
if (existsSync(".env") && !process.env.CI) process.loadEnvFile(".env");

// Migrations must use a DIRECT (non-pooled) connection; runtime uses the pooled DATABASE_URL.
// Loaded from the process environment (see .env.example). `prisma generate` does not need a URL.
const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgresql://unset/unset";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});

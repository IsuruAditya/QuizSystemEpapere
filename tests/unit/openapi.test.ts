import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { buildOpenApi, OPERATIONS } from "@/server/http/openapi";
import { ERROR_CODES } from "@/lib/errors";

/** Contract checks (§23.4): the committed document matches the schemas, and every route is documented. */
const root = path.join(__dirname, "..", "..");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? routeFiles(p) : n === "route.ts" ? [p] : [];
  });
}

/** src/app/api/v1/exams/[slug]/attempts/route.ts → /api/v1/exams/{slug}/attempts */
function toPath(file: string): string {
  const rel = path.relative(path.join(root, "src", "app"), path.dirname(file)).split(path.sep).join("/");
  return "/" + rel.replace(/\[(\w+)\]/g, "{$1}");
}

describe("OpenAPI contract", () => {
  it("docs/openapi.json is up to date with the Zod schemas (run `npm run openapi`)", () => {
    const committed = JSON.parse(readFileSync(path.join(root, "docs", "openapi.json"), "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildOpenApi())));
  });

  it("every route handler method is documented, and nothing documented is missing", () => {
    const actual = new Set<string>();
    for (const f of routeFiles(path.join(root, "src", "app", "api"))) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\b/g)) actual.add(`${m[1]!.toLowerCase()} ${toPath(f)}`);
    }
    const documented = new Set(OPERATIONS.map((o) => `${o.method} ${o.path}`));
    expect([...actual].filter((x) => !documented.has(x))).toEqual([]);
    expect([...documented].filter((x) => !actual.has(x))).toEqual([]);
  });

  it("documents only stable error codes and never answer-key fields", () => {
    const doc = JSON.stringify(buildOpenApi());
    for (const o of OPERATIONS) for (const e of o.errors) expect(ERROR_CODES).toContain(e);
    expect(doc).not.toMatch(/isCorrect|correctOptionId"\s*:\s*\{[^}]*"description"[^}]*student/i);
    const studentPaths = OPERATIONS.filter((o) => o.auth === "student").map((o) => JSON.stringify((buildOpenApi().paths as Record<string, unknown>)[o.path]));
    for (const p of studentPaths) expect(p).not.toMatch(/isCorrect|explanation"/);
  });
});

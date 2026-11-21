/** Writes docs/openapi.json from the route Zod schemas: npm run openapi */
import { mkdirSync, writeFileSync } from "node:fs";
import { buildOpenApi } from "@/server/http/openapi";

mkdirSync("docs", { recursive: true });
writeFileSync("docs/openapi.json", JSON.stringify(buildOpenApi(), null, 2) + "\n", "utf8");
console.log("docs/openapi.json written");

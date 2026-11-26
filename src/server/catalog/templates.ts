import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

/** Downloadable CSV templates (shipped files; see scripts/make-csv-fixtures.mjs). */
export const templateName = z.enum(["questions-template.csv", "questions-example.csv", "students-template.csv"]);
export type TemplateName = z.infer<typeof templateName>;

/** The path is statically scoped to the templates folder so the bundler traces only that folder. */
export async function readTemplate(name: TemplateName): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(process.cwd(), "src", "content", "templates", name)));
}

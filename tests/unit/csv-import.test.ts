import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseQuestionCsv, validateStagedRows, QUESTION_CSV_COLUMNS } from "@/server/imports/question-csv";
import type { MediaFact } from "@/server/authoring/question-validation";

const enc = (s: string) => new TextEncoder().encode(s);
const header = QUESTION_CSV_COLUMNS.join(",");
const fixture = (name: string) => new Uint8Array(readFileSync(path.join(__dirname, "..", "fixtures", "csv", name)));
const noMedia = new Map<string, MediaFact>();

describe("question CSV parsing (§19.1)", () => {
  it("parses the shipped Sinhala/English example with BOM, quoted commas, multiline and CRLF", () => {
    const { rows, fileIssues } = parseQuestionCsv(fixture("valid-example.csv"), 500);
    expect(fileIssues).toEqual([]);
    expect(rows.length).toBe(3);
    expect(rows[0]).toMatchObject({ external_id: "MATH-Q001", question_text: "What is 12 x 5?", option_b: "60", correct_option: "B", marks: "1" });
    expect(rows[1]!.question_text).toContain("සමීකරණය");
    expect(rows[1]!.question_text).toContain("$x^2");
    expect(rows[2]!.question_text).toBe("Which list is correct, given a, b and c?\nChoose one.");
    expect(rows[2]!.option_a).toBe("1, 2, 3");
    const v = validateStagedRows(rows, noMedia);
    expect(v.every((r) => r.input !== null)).toBe(true);
    expect(v[0]!.input!.correctIndex).toBe(1);
  });

  it("handles LF-only files without BOM", () => {
    const csv = `${header}\nX1,,Q?,a,b,c,d,d,2,,,,,,,,\n`;
    const { rows, fileIssues } = parseQuestionCsv(enc(csv), 500);
    expect(fileIssues).toEqual([]);
    const v = validateStagedRows(rows, noMedia);
    expect(v[0]!.input).toMatchObject({ correctIndex: 3, marks: 2 });
  });

  it("rejects invalid UTF-8 and wrong headers", () => {
    expect(parseQuestionCsv(new Uint8Array([0xff, 0xfe, 0x41]), 500).fileIssues[0]!.message).toMatch(/UTF-8/);
    const r = parseQuestionCsv(enc("id,question\n1,x\n"), 500);
    expect(r.rows).toEqual([]);
    expect(r.fileIssues[0]!.message).toMatch(/Missing column/);
  });

  it("reports unterminated quotes with a line number", () => {
    const r = parseQuestionCsv(enc(`${header}\nX1,,"broken,a,b,c,d,A,1,,,,,,,,\n`), 500);
    expect(r.fileIssues[0]!.message).toMatch(/CSV format error/);
  });

  it("enforces row limit", () => {
    const body = Array.from({ length: 3 }, (_, i) => `R${i},,Q,a,b,c,d,A,1,,,,,,,,`).join("\n");
    expect(parseQuestionCsv(enc(`${header}\n${body}`), 2).fileIssues[0]!.message).toMatch(/Too many rows/);
  });
});

describe("question CSV validation (§19.2)", () => {
  it("malformed fixture: every bad row is reported with its column, none disappear", () => {
    const { rows, fileIssues } = parseQuestionCsv(fixture("invalid-rows.csv"), 500);
    expect(fileIssues).toEqual([]);
    const v = validateStagedRows(rows, noMedia);
    expect(v.length).toBe(rows.length);
    const byId = (id: string) => v.find((r) => r.externalId === id)!;
    expect(byId("BAD-KEY").issues.map((i) => i.column)).toContain("correct_option");
    expect(byId("ZERO-MARKS").issues.map((i) => i.column)).toContain("marks");
    expect(byId("FRACTION-MARKS").issues.map((i) => i.column)).toContain("marks");
    expect(byId("EMPTY-OPTION").issues.map((i) => i.column)).toContain("option_c");
    expect(byId("BAD-TYPE").issues.map((i) => i.column)).toContain("type");
    expect(byId("URL-IMAGE").issues.map((i) => i.column)).toContain("question_image_ref");
    expect(v.filter((r) => r.externalId === "DUP-1").every((r) => r.issues.some((i) => i.column === "external_id"))).toBe(true);
    expect(v.find((r) => r.rowNumber === 2)!.issues.some((i) => i.column === "external_id")).toBe(true); // blank id row
    expect(byId("SAME-OPTIONS").issues.some((i) => i.severity === "warning")).toBe(true);
    expect(byId("SAME-OPTIONS").input).not.toBeNull(); // warnings do not block
    expect(v.filter((r) => r.input === null).length).toBe(v.filter((r) => r.issues.some((i) => i.severity === "error")).length);
  });

  it("correct_option normalises whitespace/case only; never numeric or truthy", () => {
    const mk = (c: string) => validateStagedRows(parseQuestionCsv(enc(`${header}\nX,,Q,a,b,c,d,${c},1,,,,,,,,`), 9).rows, noMedia)[0]!;
    expect(mk(" c ").input!.correctIndex).toBe(2);
    expect(mk("a").input!.correctIndex).toBe(0);
    for (const bad of ["1", "0", "true", "E", "AB", ""]) expect(mk(bad).input).toBeNull();
  });

  it("image-only content requires alt text on the media record", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const csv = `${header}\nIMG,,,a,b,c,d,A,1,,,,${id},,,,`;
    const rows = parseQuestionCsv(enc(csv), 9).rows;
    expect(validateStagedRows(rows, new Map([[id, { kind: "QUESTION_IMAGE", altText: null }]]))[0]!.input).toBeNull();
    expect(validateStagedRows(rows, new Map([[id, { kind: "QUESTION_IMAGE", altText: "Triangle ABC" }]]))[0]!.input).not.toBeNull();
    expect(validateStagedRows(rows, noMedia)[0]!.issues[0]!.message).toMatch(/not found/);
  });
});

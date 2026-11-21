"use client";
import { ClientForm } from "../ui/client-form";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { importsApi } from "@/lib/api/admin";
import { useMutation } from "@/lib/use-mutation";
import { Alert, Badge, Button, Card, Input } from "../ui";

type Col = "external_id" | "type" | "question_text" | "option_a" | "option_b" | "option_c" | "option_d" | "correct_option" | "marks" | "explanation" | "topic" | "difficulty" | "question_image_ref" | "option_a_image_ref" | "option_b_image_ref" | "option_c_image_ref" | "option_d_image_ref";
type Row = { rowNumber: number } & Record<Col, string>;
type Issue = { rowNumber: number; column: Col | null; severity: "error" | "warning"; message: string };
export interface ImportState {
  id: string;
  fileName: string;
  fileSha256: string;
  status: "STAGED" | "COMMITTED" | "DISCARDED";
  rows: Row[];
  report: { fileIssues: Issue[]; rowIssues: Issue[]; validRows: number; totalRows: number; duplicateOf: { importId: string; committedAt: string } | null };
  errorCount: number;
  warningCount: number;
}

export function ImportWorkspace({ examId, maxKb, initial }: { examId: string; maxKb: number; initial: ImportState | null }) {
  const router = useRouter();
  const [job, setJob] = useState<ImportState | null>(initial);
  const [edits, setEdits] = useState<Record<number, Row>>({});
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [done, setDone] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(true);

  const issuesByRow = useMemo(() => {
    const m = new Map<number, Issue[]>();
    for (const i of job?.report.rowIssues ?? []) m.set(i.rowNumber, [...(m.get(i.rowNumber) ?? []), i]);
    return m;
  }, [job]);
  const dirty = Object.keys(edits).length > 0 || removed.size > 0;

  // One mutation runner for the sequential workspace steps (upload, revalidate, commit, discard).
  const op = useMutation((step: () => Promise<void>) => step());
  const run = (step: () => Promise<void>) => op.run(step);
  const busy = op.busy;

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-bold">1. Choose a CSV file</h2>
        <p className="mt-1 text-sm text-muted">
          UTF-8 CSV, up to {maxKb} KB. Single-choice questions with four options. Image references are media IDs from the Media page.{" "}
          <a className="underline" href="/api/v1/admin/templates/questions-template.csv">Template</a> ·{" "}
          <a className="underline" href="/api/v1/admin/templates/questions-example.csv">Example (Sinhala + English)</a>
        </p>
        <ClientForm
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("examId", examId);
            void run(async () => {
              const r = await importsApi.upload<ImportState>(fd);
              setJob(r);
              setEdits({});
              setRemoved(new Set());
              setDone(null);
              router.replace(`/admin/exams/${examId}/import?importId=${r.id}`);
            });
          }}
        >
          <label htmlFor="file" className="sr-only">CSV file</label>
          <input id="file" name="file" type="file" accept=".csv,text/csv" required className="min-h-11 text-sm" />
          <Button type="submit" disabled={busy}>
            {busy ? "Checking…" : "Upload and validate"}
          </Button>
        </ClientForm>
      </Card>
      {op.error && <Alert kind="danger">{op.error}</Alert>}
      {done && <Alert kind="ok" live>{done}</Alert>}
      {job && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">2. Review — {job.fileName}</h2>
            <Badge kind={job.status === "COMMITTED" ? "ok" : job.errorCount ? "danger" : "info"}>{job.status}</Badge>
          </div>
          <p className="mt-1 text-sm" role="status">
            {job.report.totalRows} rows · {job.report.validRows} valid · <strong>{job.errorCount} error(s)</strong> · {job.warningCount} warning(s)
          </p>
          <p className="text-xs text-muted">SHA-256 {job.fileSha256.slice(0, 16)}…</p>
          {job.report.fileIssues.map((i, k) => (
            <Alert key={k} kind="danger" className="mt-2">
              {i.rowNumber ? `Line ${i.rowNumber}: ` : ""}
              {i.message}
            </Alert>
          ))}
          {job.report.duplicateOf && <Alert kind="warn" className="mt-2">This exact file was already imported into this exam on {new Date(job.report.duplicateOf.committedAt).toLocaleString()}. Committing again adds the questions a second time.</Alert>}
          {job.status === "STAGED" && job.rows.length > 0 && (
            <>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-5" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Show only rows with problems
              </label>
              <div className="mt-3 space-y-3">
                {job.rows
                  .filter((r) => !onlyProblems || issuesByRow.has(r.rowNumber) || edits[r.rowNumber])
                  .map((r) => {
                    const row = edits[r.rowNumber] ?? r;
                    const iss = issuesByRow.get(r.rowNumber) ?? [];
                    const isRemoved = removed.has(r.rowNumber);
                    return (
                      <fieldset key={r.rowNumber} className={`rounded-lg border p-3 ${iss.some((i) => i.severity === "error") ? "border-danger" : "border-border"} ${isRemoved ? "opacity-50" : ""}`}>
                        <legend className="px-1 text-sm font-bold">
                          Row {r.rowNumber} {row.external_id && `· ${row.external_id}`}
                        </legend>
                        {iss.map((i, k) => (
                          <p key={k} className={`text-sm ${i.severity === "error" ? "text-danger" : "text-warn"}`}>
                            {i.severity === "error" ? "✗" : "⚠"} {i.column ? `${i.column}: ` : ""}
                            {i.message}
                          </p>
                        ))}
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {(["external_id", "question_text", "option_a", "option_b", "option_c", "option_d", "correct_option", "marks", "explanation", "question_image_ref"] as const).map((c) => (
                            <div key={c} className={c === "question_text" || c === "explanation" ? "sm:col-span-2" : ""}>
                              <label htmlFor={`r${r.rowNumber}-${c}`} className="text-xs font-semibold">
                                {c}
                              </label>
                              <Input
                                id={`r${r.rowNumber}-${c}`}
                                value={row[c]}
                                disabled={isRemoved}
                                error={iss.some((i) => i.column === c && i.severity === "error") ? "x" : undefined}
                                onChange={(e) => setEdits((s) => ({ ...s, [r.rowNumber]: { ...row, [c]: e.target.value } }))}
                              />
                            </div>
                          ))}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2"
                          onClick={() => setRemoved((s) => { const n = new Set(s); if (n.has(r.rowNumber)) n.delete(r.rowNumber); else n.add(r.rowNumber); return n; })}
                        >
                          {isRemoved ? "Keep this row" : "Remove this row from the import"}
                        </Button>
                      </fieldset>
                    );
                  })}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={busy || !dirty}
                  onClick={() =>
                    run(async () => {
                      const r = await importsApi.revalidate<ImportState>(job.id, Object.values(edits), [...removed]);
                      setJob(r);
                      setEdits({});
                      setRemoved(new Set());
                    })
                  }
                >
                  Revalidate changes
                </Button>
                <Button
                  disabled={busy || dirty || job.errorCount > 0}
                  onClick={() =>
                    run(async () => {
                      if (job.report.duplicateOf && !window.confirm("Import this file again?")) return;
                      const r = await importsApi.commit(job.id, Boolean(job.report.duplicateOf));
                      setJob({ ...job, status: "COMMITTED" });
                      setDone(`${r.questionVersionIds.length} questions added to the draft exam. Preview the exam, then publish.`);
                      router.refresh();
                    })
                  }
                >
                  3. Add {job.report.validRows} questions to the draft
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => run(async () => { await importsApi.discard(job.id); setJob(null); })}>
                  Discard import
                </Button>
              </div>
              {dirty && <p className="mt-2 text-sm text-warn">Revalidate your changes before adding questions.</p>}
              {!dirty && job.errorCount > 0 && <p className="mt-2 text-sm text-danger">Fix or remove every row with errors. Nothing is added until all rows are valid.</p>}
            </>
          )}
          {job.status === "COMMITTED" && (
            <div className="mt-3 flex gap-2">
              <a className="font-semibold underline" href={`/admin/exams/${examId}/preview`}>Preview exam</a>
              <a className="font-semibold underline" href={`/admin/exams/${examId}`}>Back to exam</a>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

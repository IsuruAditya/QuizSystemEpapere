"use client";
import { ClientForm } from "../ui/client-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { examsApi, questionsApi } from "@/lib/api/admin";
import { useMutation } from "@/lib/use-mutation";
import { Alert, Button, EmptyState, Input } from "../ui";

export interface DraftItem {
  questionId: string;
  versionId: string;
  stem: string;
  marks: number;
  externalId: string | null;
}

/** Ordered question list of a DRAFT exam: reorder, remove, add from the bank, then save. */
export function DraftQuestions({ examId, initial }: { examId: string; initial: DraftItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<DraftItem[] | null>(null);
  const saveOrder = useMutation(examsApi.setQuestions, { fallback: "Could not save." });
  const search_ = useMutation(questionsApi.search);
  const update = (n: DraftItem[]) => {
    setItems(n);
    setDirty(true);
  };
  const move = (i: number, d: number) => {
    const n = [...items];
    const [x] = n.splice(i, 1);
    n.splice(i + d, 0, x!);
    update(n);
  };
  const total = items.reduce((s, i) => s + i.marks, 0);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {items.length} questions · {total} marks{dirty && " · unsaved changes"}
      </p>
      {(saveOrder.error ?? search_.error) && <Alert kind="danger">{saveOrder.error ?? search_.error}</Alert>}
      {items.length === 0 ? (
        <EmptyState>No questions yet. Import a CSV or add questions from the bank.</EmptyState>
      ) : (
        <ol className="space-y-2">
          {items.map((q, i) => (
            <li key={q.versionId} className="flex items-start gap-2 rounded-lg border border-border p-2">
              <span className="w-8 shrink-0 pt-2 text-right font-bold">{i + 1}.</span>
              <div className="min-w-0 flex-1 pt-2">
                <p className="line-clamp-2 text-sm">{q.stem || "(image question)"}</p>
                <p className="text-xs text-muted">
                  {q.externalId ?? "—"} · {q.marks} mark(s) ·{" "}
                  <Link className="underline" href={`/admin/questions/${q.questionId}?returnTo=/admin/exams/${examId}`}>
                    Edit
                  </Link>
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </Button>
                <Button size="sm" variant="ghost" aria-label={`Move question ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </Button>
                <Button size="sm" variant="ghost" aria-label={`Remove question ${i + 1}`} onClick={() => update(items.filter((_, k) => k !== i))}>
                  ✕
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!dirty || saveOrder.busy}
          onClick={async () => {
            if (!(await saveOrder.run(examId, items.map((i) => i.versionId)))) return;
            setDirty(false);
            router.refresh();
          }}
        >
          Save question order
        </Button>
      </div>
      <ClientForm
        className="flex flex-wrap items-end gap-2 rounded-lg bg-surface p-3"
        role="search"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await search_.run(search);
          if (!r) return;
          setResults(r.items.map((x) => ({ questionId: x.id, versionId: x.versionId, stem: x.stem, marks: x.marks, externalId: x.externalId })));
        }}
      >
        <div className="min-w-48 flex-1">
          <label htmlFor="bank-search" className="text-sm font-semibold">
            Add from question bank
          </label>
          <Input id="bank-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search text or external ID" />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        <Link href={`/admin/questions/new?addToExam=${examId}`} className="min-h-11 rounded-lg px-3 py-2.5 text-sm font-semibold underline">
          Write a new question
        </Link>
      </ClientForm>
      {results && (
        <ul className="space-y-1">
          {results.length === 0 && <li className="text-sm text-muted">No matches.</li>}
          {results.map((r) => {
            const already = items.some((i) => i.questionId === r.questionId);
            return (
              <li key={r.versionId} className="flex items-center gap-2 text-sm">
                <Button size="sm" variant="secondary" disabled={already} onClick={() => update([...items, r])}>
                  {already ? "Added" : "Add"}
                </Button>
                <span className="line-clamp-1">
                  {r.externalId ? `${r.externalId}: ` : ""}
                  {r.stem}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

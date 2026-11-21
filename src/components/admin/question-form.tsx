"use client";
import { ClientForm } from "../ui/client-form";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { questionsApi, type QuestionBody } from "@/lib/api/admin";
import { useMutation } from "@/lib/use-mutation";
import { MathText } from "../math-text";
import { Alert, Button, Field, Input, Textarea } from "../ui";

export type QuestionValues = QuestionBody;

const L = ["A", "B", "C", "D"];

/** Manual question editor; saving an existing question creates a new version (published exams keep theirs). */
export function QuestionForm({ questionId, externalId, initial, addToExam, returnTo }: { questionId: string | null; externalId: string | null; initial: QuestionValues; addToExam: string | null; returnTo: string | null }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [ext, setExt] = useState(externalId ?? "");
  const save = useMutation((question: QuestionBody) => (questionId ? questionsApi.update(questionId, question) : questionsApi.create(question, ext || null, addToExam)), { fallback: "Could not save." });
  const errors = save.fieldErrors;
  const [msg, setMsg] = useState<string | null>(null);
  const opt = (i: number, patch: Partial<QuestionValues["options"][number]>) => setV((s) => ({ ...s, options: s.options.map((o, k) => (k === i ? { ...o, ...patch } : o)) }));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ClientForm
        noValidate
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg(null);
          const r = await save.run({ ...v, stemMediaId: v.stemMediaId || null, options: v.options.map((o) => ({ text: o.text || null, mediaId: o.mediaId || null })) });
          if (!r) return;
          setMsg(`Saved.${r.warnings.length ? ` Warnings: ${r.warnings.join(" ")}` : ""}`);
          if (returnTo) router.push(returnTo);
          else if (!questionId) router.push(`/admin/questions/${r.questionId}`);
          router.refresh();
        }}
      >
        {save.error && <Alert kind="danger">{save.error}</Alert>}
        {msg && <Alert kind="ok" live>{msg}</Alert>}
        {!questionId && (
          <Field id="externalId" label="External ID (optional)">
            <Input id="externalId" value={ext} onChange={(e) => setExt(e.target.value)} />
          </Field>
        )}
        <Field id="stem" label="Question (Sinhala/English; use $…$ for math)" error={errors.stem}>
          <Textarea id="stem" value={v.stem} onChange={(e) => setV({ ...v, stem: e.target.value })} error={errors.stem} />
        </Field>
        <Field id="stemMediaId" label="Question image media ID (optional)" error={errors.stemMediaId}>
          <Input id="stemMediaId" value={v.stemMediaId ?? ""} onChange={(e) => setV({ ...v, stemMediaId: e.target.value.trim() || null })} />
        </Field>
        <fieldset className="space-y-3 rounded-lg border border-border p-3">
          <legend className="px-1 font-semibold">Options — choose the correct one</legend>
          {v.options.map((o, i) => (
            <div key={i} className="flex items-start gap-2">
              <input type="radio" name="correct" id={`correct-${i}`} className="mt-3 size-5" checked={v.correctIndex === i} onChange={() => setV({ ...v, correctIndex: i })} aria-label={`Option ${L[i]} is correct`} />
              <div className="flex-1 space-y-1">
                <label htmlFor={`opt-${i}`} className="text-sm font-semibold">
                  Option {L[i]}
                </label>
                <Input id={`opt-${i}`} value={o.text ?? ""} onChange={(e) => opt(i, { text: e.target.value })} error={errors[`options.${i}`]} />
                <Input id={`optimg-${i}`} aria-label={`Option ${L[i]} image media ID`} placeholder="Image media ID (optional)" value={o.mediaId ?? ""} onChange={(e) => opt(i, { mediaId: e.target.value.trim() || null })} />
                {errors[`options.${i}`] && <p className="text-sm text-danger">{errors[`options.${i}`]}</p>}
              </div>
            </div>
          ))}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="marks" label="Marks" error={errors.marks}>
            <Input id="marks" type="number" min={1} max={100} value={v.marks} onChange={(e) => setV({ ...v, marks: Number(e.target.value) })} />
          </Field>
          <Field id="topic" label="Topic">
            <Input id="topic" value={v.topic ?? ""} onChange={(e) => setV({ ...v, topic: e.target.value || null })} />
          </Field>
          <Field id="difficulty" label="Difficulty">
            <Input id="difficulty" value={v.difficulty ?? ""} onChange={(e) => setV({ ...v, difficulty: e.target.value || null })} />
          </Field>
        </div>
        <Field id="explanation" label="Explanation (shown per the exam's release policy)">
          <Textarea id="explanation" value={v.explanation ?? ""} onChange={(e) => setV({ ...v, explanation: e.target.value || null })} />
        </Field>
        <Button type="submit" size="lg" disabled={save.busy}>
          {save.busy ? "Saving…" : questionId ? "Save as new version" : "Create question"}
        </Button>
      </ClientForm>
      <aside aria-label="Preview" className="rounded-xl border border-border p-4 lg:sticky lg:top-4 lg:self-start">
        <p className="mb-2 text-sm font-bold text-muted">Preview</p>
        <div className="text-lg">
          <MathText text={v.stem} />
        </div>
        <ul className="mt-3 space-y-1.5">
          {v.options.map((o, i) => (
            <li key={i} className={`rounded-lg border p-2 ${v.correctIndex === i ? "border-ok bg-ok-soft" : "border-border"}`}>
              <strong>{L[i]}.</strong> <MathText text={o.text} />
            </li>
          ))}
        </ul>
        {v.explanation && (
          <div className="mt-2 rounded bg-surface p-2 text-sm">
            <MathText text={v.explanation} />
          </div>
        )}
      </aside>
    </div>
  );
}

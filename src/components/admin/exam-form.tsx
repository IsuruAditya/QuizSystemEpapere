"use client";
import { ClientForm } from "../ui/client-form";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { examsApi, type ExamSettingsBody } from "@/lib/api/admin";
import { useMutation } from "@/lib/use-mutation";
import { colomboInputToUtc, toColomboInput } from "@/lib/time";
import { Alert, Button, Field, Input, Select, Textarea } from "../ui";

type Opt = { id: string; label: string };
export type ExamFormValues = ExamSettingsBody;

const VIS = [
  ["IMMEDIATE", "Immediately after submitting"],
  ["AFTER_RELEASE", "After the review release time"],
  ["NEVER", "Never"],
] as const;

const DEFAULTS = {
  RANKED: { scoreVisibility: "IMMEDIATE", correctnessVisibility: "AFTER_RELEASE", answerVisibility: "AFTER_RELEASE", explanationVisibility: "AFTER_RELEASE" },
  PRACTICE: { scoreVisibility: "IMMEDIATE", correctnessVisibility: "IMMEDIATE", answerVisibility: "IMMEDIATE", explanationVisibility: "IMMEDIATE" },
};

export function ExamForm({ examId, initial, grades, subjects, teachers, covers, published }: { examId: string | null; initial: ExamFormValues; grades: Opt[]; subjects: Opt[]; teachers: Opt[]; covers: Opt[]; published: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [untimed, setUntimed] = useState(initial.durationMinutes === null);
  const save = useMutation((body: ExamSettingsBody): Promise<{ id?: string; ok?: true }> => (examId ? examsApi.update(examId, body) : examsApi.create(body)), { fallback: "Could not save." });
  const errors = save.fieldErrors;
  const [msg, setMsg] = useState<string | null>(null);
  const set = <K extends keyof ExamFormValues>(k: K, val: ExamFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const dt = (k: "opensAt" | "closesAt" | "reviewReleaseAt") => (
    <Input
      id={k}
      type="datetime-local"
      value={toColomboInput(v[k])}
      error={errors[k]}
      onChange={(e) => set(k, e.target.value ? (colomboInputToUtc(e.target.value)?.toISOString() ?? null) : null)}
    />
  );
  const gradeLabel = grades.find((g) => g.id === v.gradeId)?.label ?? "the selected grade";

  return (
    <ClientForm
      noValidate
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        const body = { ...v, durationMinutes: untimed && v.mode === "PRACTICE" ? null : v.durationMinutes, teacherId: v.teacherId || null, coverMediaId: v.coverMediaId || null };
        const r = await save.run(body);
        if (!r) return;
        if (examId) {
          setMsg("Saved.");
          router.refresh();
        } else if (r.id) router.push(`/admin/exams/${r.id}`);
      }}
    >
      {save.error && <Alert kind="danger">{save.error}</Alert>}
      {msg && <Alert kind="ok" live>{msg}</Alert>}
      {published && <Alert kind="info">This exam is published. The paper cannot change; you may adjust schedule and release settings. To use a different paper, duplicate the exam (a new exam has its own leaderboard).</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="title" label="Title" error={errors.title}>
          <Input id="title" value={v.title} onChange={(e) => set("title", e.target.value)} error={errors.title} required />
        </Field>
        <Field id="mode" label="Mode" hint="Ranked: one official attempt, per-exam leaderboard. Practice: repeatable, never ranked.">
          <Select
            id="mode"
            value={v.mode}
            disabled={published}
            onChange={(e) => {
              const m = e.target.value as "RANKED" | "PRACTICE";
              setV((s) => ({ ...s, mode: m, ...(examId ? {} : DEFAULTS[m]) }));
              if (m === "RANKED") setUntimed(false);
            }}
          >
            <option value="RANKED">Ranked</option>
            <option value="PRACTICE">Practice</option>
          </Select>
        </Field>
        <Field id="gradeId" label="Grade" error={errors.gradeId} hint={`Eligibility rule: every enabled student currently in ${gradeLabel} can take this exam.`}>
          <Select id="gradeId" value={v.gradeId} disabled={published} onChange={(e) => set("gradeId", e.target.value)}>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="subjectId" label="Subject">
          <Select id="subjectId" value={v.subjectId} disabled={published} onChange={(e) => set("subjectId", e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="teacherId" label="Teacher (photo shown on the exam page)">
          <Select id="teacherId" value={v.teacherId ?? ""} onChange={(e) => set("teacherId", e.target.value || null)}>
            <option value="">None</option>
            {teachers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="coverMediaId" label="Cover image (optional)">
          <Select id="coverMediaId" value={v.coverMediaId ?? ""} onChange={(e) => set("coverMediaId", e.target.value || null)}>
            <option value="">None</option>
            {covers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id="description" label="Description">
        <Textarea id="description" value={v.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <Field id="instructions" label="Instructions shown before starting (supports $math$)">
        <Textarea id="instructions" value={v.instructions} onChange={(e) => set("instructions", e.target.value)} />
      </Field>

      <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-3">
        <legend className="px-1 font-semibold">Timing (enter times in Asia/Colombo)</legend>
        <Field id="durationMinutes" label="Duration (minutes)" error={errors.durationMinutes}>
          <Input id="durationMinutes" type="number" min={1} max={600} disabled={untimed} value={v.durationMinutes ?? ""} onChange={(e) => set("durationMinutes", e.target.value ? Number(e.target.value) : null)} error={errors.durationMinutes} />
        </Field>
        <Field id="opensAt" label="Opens at (optional)" error={errors.opensAt}>
          {dt("opensAt")}
        </Field>
        <Field id="closesAt" label={v.mode === "RANKED" ? "Closes at (required)" : "Closes at (optional)"} error={errors.closesAt}>
          {dt("closesAt")}
        </Field>
        {v.mode === "PRACTICE" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={untimed} onChange={(e) => setUntimed(e.target.checked)} /> Untimed practice (no countdown)
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={v.allowLateStart} onChange={(e) => set("allowLateStart", e.target.checked)} /> Allow late start (students are warned they get less time)
        </label>
        {v.mode === "PRACTICE" && (
          <Field id="maxAttempts" label="Max attempts (blank = unlimited)">
            <Input id="maxAttempts" type="number" min={1} max={100} value={v.maxAttempts ?? ""} onChange={(e) => set("maxAttempts", e.target.value ? Number(e.target.value) : null)} />
          </Field>
        )}
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
        <legend className="px-1 font-semibold">Results and review (enforced by the server)</legend>
        {(
          [
            ["scoreVisibility", "Score"],
            ["correctnessVisibility", "Which answers were right/wrong"],
            ["answerVisibility", "Correct answers"],
            ["explanationVisibility", "Explanations"],
          ] as const
        ).map(([k, label]) => (
          <Field key={k} id={k} label={label}>
            <Select id={k} value={v[k]} onChange={(e) => set(k, e.target.value)}>
              {VIS.map(([val, l]) => (
                <option key={val} value={val}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        ))}
        <Field id="reviewReleaseAt" label="Review release time (blank = when the exam closes)" error={errors.reviewReleaseAt}>
          {dt("reviewReleaseAt")}
        </Field>
        {v.mode === "RANKED" && (
          <Field id="leaderboardVisibility" label="Leaderboard">
            <Select id="leaderboardVisibility" value={v.leaderboardVisibility} onChange={(e) => set("leaderboardVisibility", e.target.value)}>
              <option value="STUDENTS">Visible to signed-in students of this grade</option>
              <option value="HIDDEN">Admins only</option>
            </Select>
          </Field>
        )}
      </fieldset>
      <Button type="submit" size="lg" disabled={save.busy}>
        {save.busy ? "Saving…" : examId ? "Save settings" : "Create exam"}
      </Button>
    </ClientForm>
  );
}

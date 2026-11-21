"use client";
import { ClientForm } from "../ui/client-form";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { examsApi } from "@/lib/api/admin";
import { useMutation } from "@/lib/use-mutation";
import { Alert, Button, Field, Input, Select, Textarea } from "../ui";

/** Void an attempt: reason + optional replacement + admin password re-confirmation. */
export function VoidForm({ attemptId, label }: { attemptId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const voidM = useMutation(examsApi.voidAttempt, { fallback: "Failed." });
  if (!open)
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`Void attempt of ${label}`}>
        Void…
      </Button>
    );
  return (
    <ClientForm
      className="mt-2 space-y-2 rounded-lg border border-danger p-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const ok = await voidM.run(attemptId, { reason: String(fd.get("reason") ?? ""), grantReplacement: fd.get("grant") === "on", adminPassword: String(fd.get("adminPassword") ?? "") });
        if (ok) router.refresh();
      }}
    >
      {voidM.error && <Alert kind="danger">{voidM.error}</Alert>}
      <Field id={`reason-${attemptId}`} label="Reason (recorded in the audit log)">
        <Input id={`reason-${attemptId}`} name="reason" minLength={5} required />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="grant" className="size-5" /> Allow one replacement attempt
      </label>
      <Field id={`pw-${attemptId}`} label="Your password">
        <Input id={`pw-${attemptId}`} name="adminPassword" type="password" autoComplete="current-password" required />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="danger" disabled={voidM.busy}>
          Void attempt
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </ClientForm>
  );
}

export interface SlotForCorrection {
  examQuestionId: string;
  position: number;
  stem: string;
  options: { id: string; letter: string; text: string | null }[];
  correctOptionId: string;
}

/** Audited answer-key correction: creates a new grading revision and queues a regrade. */
export function CorrectionForm({ examId, slots }: { examId: string; slots: SlotForCorrection[] }) {
  const router = useRouter();
  const [slot, setSlot] = useState(slots[0]?.examQuestionId ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const correct = useMutation(examsApi.correctKey, { fallback: "Failed." });
  const s = slots.find((x) => x.examQuestionId === slot);
  return (
    <ClientForm
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (!window.confirm("Create a new grading revision? All results for this exam will be recalculated; times are not changed.")) return;
        setMsg(null);
        const r = await correct.run(examId, {
          reason: String(fd.get("reason") ?? ""),
          adminPassword: String(fd.get("adminPassword") ?? ""),
          changes: [{ examQuestionId: slot, correctOptionId: String(fd.get("correctOptionId") ?? "") }],
        });
        if (!r) return;
        setMsg(`Grading revision ${r.revisionNo} created. Regrading runs in the background; the leaderboard stays provisional until it completes.`);
        router.refresh();
      }}
    >
      {correct.error && <Alert kind="danger">{correct.error}</Alert>}
      {msg && <Alert kind="ok" live>{msg}</Alert>}
      <Field id="slot" label="Question">
        <Select id="slot" value={slot} onChange={(e) => setSlot(e.target.value)}>
          {slots.map((x) => (
            <option key={x.examQuestionId} value={x.examQuestionId}>
              Q{x.position + 1}: {x.stem.slice(0, 60)}
            </option>
          ))}
        </Select>
      </Field>
      {s && (
        <Field id="correctOptionId" label="Correct answer">
          <Select id="correctOptionId" name="correctOptionId" key={s.examQuestionId} defaultValue={s.correctOptionId}>
            {s.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.letter}. {(o.text ?? "(image)").slice(0, 60)}
                {o.id === s.correctOptionId ? " (current key)" : ""}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field id="corr-reason" label="Reason (required, audited)">
        <Textarea id="corr-reason" name="reason" minLength={5} required />
      </Field>
      <Field id="corr-pw" label="Your password">
        <Input id="corr-pw" name="adminPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" variant="danger" disabled={correct.busy}>
        Correct answer key and regrade
      </Button>
    </ClientForm>
  );
}

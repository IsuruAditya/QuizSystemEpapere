"use client";
import { ClientForm } from "@/components/ui/client-form";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authApi } from "@/lib/api/student";
import { useMutation } from "@/lib/use-mutation";

export function PasswordForm({ next, labels }: { next: string; labels: Record<"current" | "next" | "confirm" | "differ" | "save" | "done" | "error", string> }) {
  const router = useRouter();
  const m = useMutation(authApi.changePassword, { fallback: labels.error });
  const [mismatch, setMismatch] = useState(false);
  const [done, setDone] = useState(false);
  const err: Record<string, string> = { ...m.fieldErrors, ...(mismatch ? { confirm: labels.differ } : {}) };
  return (
    <ClientForm
      className="mt-6 space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const nw = String(fd.get("newPassword") ?? "");
        setMismatch(nw !== fd.get("confirm"));
        if (nw !== fd.get("confirm")) return;
        if (!(await m.run(String(fd.get("currentPassword") ?? ""), nw))) return;
        setDone(true);
        router.replace(next);
        router.refresh();
      }}
    >
      {m.error && Object.keys(m.fieldErrors).length === 0 && <Alert kind="danger">{m.error}</Alert>}
      {done && <Alert kind="ok" live>{labels.done}</Alert>}
      <Field id="currentPassword" label={labels.current} error={err.currentPassword}>
        <Input id="currentPassword" type="password" autoComplete="current-password" error={err.currentPassword} required />
      </Field>
      <Field id="newPassword" label={labels.next} error={err.newPassword} hint="8+">
        <Input id="newPassword" type="password" autoComplete="new-password" minLength={8} error={err.newPassword} hint required />
      </Field>
      <Field id="confirm" label={labels.confirm} error={err.confirm}>
        <Input id="confirm" type="password" autoComplete="new-password" error={err.confirm} required />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={m.busy}>
        {labels.save}
      </Button>
    </ClientForm>
  );
}

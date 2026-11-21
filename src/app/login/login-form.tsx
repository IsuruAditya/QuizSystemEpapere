"use client";
import { ClientForm } from "@/components/ui/client-form";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authApi } from "@/lib/api/student";
import { format } from "@/lib/i18n/dictionaries";
import { useMutation } from "@/lib/use-mutation";
import type { ApiError } from "@/lib/api-client";

type Labels = { id: string; idHint: string; password: string; submit: string; submitting: string; failed: string; tooMany: string; error: string };

export function LoginForm({ returnTo, labels }: { returnTo: string; labels: Labels }) {
  const router = useRouter();
  const describe = (a: ApiError) => (a.code === "UNAUTHENTICATED" ? labels.failed : a.code === "RATE_LIMITED" ? format(labels.tooMany, { seconds: a.retryAfterSeconds ?? 60 }) : labels.error);
  const m = useMutation(authApi.login, { describe });
  return (
    <ClientForm
      className="mt-6 space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const r = await m.run(String(fd.get("username") ?? ""), String(fd.get("password") ?? ""), returnTo);
        if (!r) return;
        // Account switch on a shared device: drop per-tab exam state of the previous user.
        try {
          sessionStorage.clear();
        } catch {
          /* storage unavailable */
        }
        router.replace(r.next);
        router.refresh();
      }}
    >
      {m.error && <Alert kind="danger">{m.error}</Alert>}
      <Field id="username" label={labels.id} hint={labels.idHint}>
        <Input id="username" name="username" autoComplete="username" autoCapitalize="characters" spellCheck={false} required hint />
      </Field>
      <Field id="password" label={labels.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={m.busy}>
        {m.busy ? labels.submitting : labels.submit}
      </Button>
    </ClientForm>
  );
}

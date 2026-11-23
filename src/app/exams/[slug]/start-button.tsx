"use client";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { attemptApi } from "@/lib/api/student";
import { useMutation } from "@/lib/use-mutation";
import type { ErrorCode } from "@/lib/errors";

/** Start/resume: this tab becomes the writable controller; the token lives only in sessionStorage. */
export function StartButton({ slug, label, busyLabel, messages }: { slug: string; label: string; busyLabel: string; messages: Partial<Record<ErrorCode | "default", string>> }) {
  const router = useRouter();
  const m = useMutation(attemptApi.start, { describe: (a) => messages[a.code as ErrorCode] ?? messages.default ?? null });
  return (
    <div className="mx-auto max-w-6xl space-y-2">
      {m.error && <Alert kind="danger">{m.error}</Alert>}
      <Button
        size="lg"
        className="w-full"
        disabled={m.busy}
        onClick={async () => {
          const r = await m.run(slug);
          if (!r) return router.refresh();
          if (r.controllerToken) sessionStorage.setItem(`ep:ctl:${r.attemptId}`, r.controllerToken);
          router.push(r.status === "IN_PROGRESS" ? `/attempts/${r.attemptId}` : `/attempts/${r.attemptId}/result`);
        }}
      >
        {m.busy ? busyLabel : label}
      </Button>
    </div>
  );
}

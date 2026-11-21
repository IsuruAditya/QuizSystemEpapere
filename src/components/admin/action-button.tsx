"use client";
import { useRouter } from "next/navigation";
import { examsApi, type ExamCommand } from "@/lib/api/admin";
import { useMutation } from "@/lib/use-mutation";
import type { ApiError } from "@/lib/api-client";
import { Alert, Button } from "../ui";

/** Server-reported publish issues are appended to the message so the admin sees what to fix. */
function describe(a: ApiError): string {
  const raw = a.problem?.issues;
  const issues = Array.isArray(raw) ? raw.filter((i): i is { position: number | null; message: string } => typeof i === "object" && i !== null && "message" in i) : [];
  return [a.problem?.title ?? a.message, ...issues.map((i) => `${i.position !== null ? `Q${i.position + 1}: ` : ""}${i.message}`)].join(" · ");
}

/** One exam lifecycle command (publish/unpublish/archive/duplicate) with confirmation. */
export function ExamCommandButton({ examId, command, label, confirm, variant = "secondary" }: { examId: string; command: ExamCommand; label: string; confirm?: string; variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const router = useRouter();
  const m = useMutation(examsApi.command, { describe });
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        variant={variant}
        disabled={m.busy}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          const r = await m.run(examId, command);
          if (!r) return;
          if (command === "duplicate" && r.id) router.push(`/admin/exams/${r.id}`);
          router.refresh();
        }}
      >
        {m.busy ? "…" : label}
      </Button>
      {m.error && <Alert kind="danger">{m.error}</Alert>}
    </span>
  );
}

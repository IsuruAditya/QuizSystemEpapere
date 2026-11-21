"use client";
import { ClientForm } from "../ui/client-form";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { catalogApi } from "@/lib/api/admin";
import { useMutation } from "@/lib/use-mutation";
import type { ApiError } from "@/lib/api-client";
import { Alert, Button, Input, Select } from "../ui";

type FieldDef = { key: string; label: string; type?: "text" | "number" | "checkbox" | "select"; options?: { id: string; label: string }[] };

/** Generic small editor row for one catalog record (grade/subject/teacher/branding). */
export function CatalogRow({ kind, id, fields, initial, submitLabel }: { kind: string; id: string | null; fields: FieldDef[]; initial: Record<string, unknown>; submitLabel: string }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const describe = (a: ApiError) => [a.problem?.title, ...(a.problem?.errors ?? []).map((i) => `${i.path}: ${i.message}`)].filter(Boolean).join(" ");
  const save = useMutation(catalogApi.save, { describe });
  const [ok, setOk] = useState(false);
  return (
    <ClientForm
      className="flex flex-wrap items-end gap-2 border-b border-border py-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setOk(false);
        if (!(await save.run(kind, id, v))) return;
        setOk(true);
        if (!id) setV(initial);
        router.refresh();
      }}
    >
      {fields.map((f) => {
        const fid = `${kind}-${id ?? "new"}-${f.key}`;
        return (
          <div key={f.key} className={f.type === "checkbox" ? "flex items-center gap-1 pb-3" : "min-w-28 flex-1"}>
            <label htmlFor={fid} className="text-xs font-semibold">
              {f.label}
            </label>
            {f.type === "checkbox" ? (
              <input id={fid} type="checkbox" className="size-5" checked={Boolean(v[f.key])} onChange={(e) => setV({ ...v, [f.key]: e.target.checked })} />
            ) : f.type === "select" ? (
              <Select id={fid} value={String(v[f.key] ?? "")} onChange={(e) => setV({ ...v, [f.key]: e.target.value || null })}>
                <option value="">None</option>
                {f.options?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Input id={fid} type={f.type ?? "text"} value={String(v[f.key] ?? "")} onChange={(e) => setV({ ...v, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value })} />
            )}
          </div>
        );
      })}
      <Button type="submit" size="sm" variant={id ? "secondary" : "primary"} disabled={save.busy}>
        {ok ? "✓ Saved" : submitLabel}
      </Button>
      {save.error && <Alert kind="danger" className="w-full">{save.error}</Alert>}
    </ClientForm>
  );
}

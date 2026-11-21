"use client";
import { ClientForm } from "../ui/client-form";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { mediaApi } from "@/lib/api/admin";
import { useMutation } from "@/lib/use-mutation";
import { Alert, Button, Field, Input, Select } from "../ui";

export function MediaUpload({ maxKb }: { maxKb: number }) {
  const router = useRouter();
  const upload = useMutation(mediaApi.upload, { fallback: "Upload failed." });
  const [ok, setOk] = useState<string | null>(null);
  return (
    <ClientForm
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setOk(null);
        const r = await upload.run(new FormData(form));
        if (!r) return;
        setOk(`Uploaded. Media ID: ${r.id}`);
        form.reset();
        router.refresh();
      }}
    >
      {upload.error && <Alert kind="danger">{upload.error}</Alert>}
      {ok && <Alert kind="ok" live>{ok}</Alert>}
      <Field id="kind" label="Type">
        <Select id="kind" name="kind" defaultValue="QUESTION_IMAGE">
          <option value="QUESTION_IMAGE">Question/diagram image (private until an attempt starts)</option>
          <option value="TEACHER_PHOTO">Teacher photo (public)</option>
          <option value="EXAM_COVER">Exam cover (public)</option>
        </Select>
      </Field>
      <Field id="altText" label="Alternative text (describe the image for screen readers)" hint="Required before publishing if the question or option has no text.">
        <Input id="altText" name="altText" maxLength={500} hint />
      </Field>
      <Field id="file" label={`Image (PNG, JPEG or WebP, up to ${maxKb} KB, max 4096×4096)`}>
        <input id="file" name="file" type="file" accept="image/png,image/jpeg,image/webp" required className="min-h-11 text-sm" />
      </Field>
      <Button type="submit" disabled={upload.busy}>
        {upload.busy ? "Uploading…" : "Upload"}
      </Button>
    </ClientForm>
  );
}

export function AltTextEditor({ id, initial }: { id: string; initial: string }) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(false);
  const save = useMutation(mediaApi.setAlt);
  return (
    <ClientForm
      className="flex gap-1"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaved(Boolean(await save.run(id, v)));
      }}
    >
      <Input id={`alt-${id}`} aria-label="Alternative text" value={v} onChange={(e) => { setV(e.target.value); setSaved(false); }} className="min-h-9 text-sm" />
      <Button type="submit" size="sm" variant="secondary" disabled={save.busy} aria-label={save.error ? `Save failed: ${save.error}` : "Save alternative text"}>
        {saved ? "✓" : save.error ? "!" : "Save"}
      </Button>
    </ClientForm>
  );
}

"use client";
import { ClientForm } from "../ui/client-form";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { studentsApi, type BulkResult, type StudentBody } from "@/lib/api/admin";
import { useMutation } from "@/lib/use-mutation";
import { Alert, Button, Field, Input, Select, Table } from "../ui";

type Opt = { id: string; label: string };
export type StudentValues = StudentBody;

/** Shows a one-time credential. It is not stored anywhere in readable form. */
function Credential({ epId, password }: { epId: string; password: string }) {
  return (
    <Alert kind="ok" live title="Temporary password (shown once)">
      <p>
        ID <strong className="font-mono">{epId}</strong> · password <strong className="font-mono">{password}</strong>
      </p>
      <p className="text-xs">Give it to the student privately. They must choose a new password at first sign-in.</p>
    </Alert>
  );
}

export function StudentForm({ userId, initial, grades }: { userId: string | null; initial: StudentValues; grades: Opt[] }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [cred, setCred] = useState<{ epId: string; password: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const save = useMutation(
    async (b: StudentBody) => {
      if (!userId) return studentsApi.create(b);
      const { epId: _unchangeable, ...rest } = b;
      void _unchangeable;
      await studentsApi.update(userId, rest);
      return null;
    },
    { fallback: "Could not save." },
  );
  const errors = save.fieldErrors;
  const f = (k: keyof StudentValues, label: string, opts: { type?: string; hint?: string; disabled?: boolean } = {}) => (
    <Field id={k} label={label} error={errors[k]} hint={opts.hint}>
      <Input id={k} type={opts.type} value={v[k]} disabled={opts.disabled} error={errors[k]} hint={Boolean(opts.hint)} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
    </Field>
  );
  return (
    <ClientForm
      noValidate
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        const r = await save.run(v);
        if (r === undefined) return;
        if (r) {
          setCred({ epId: r.epId, password: r.temporaryPassword });
          setV({ ...initial });
        } else setMsg("Saved.");
        router.refresh();
      }}
    >
      {save.error && <Alert kind="danger">{save.error}</Alert>}
      {msg && <Alert kind="ok" live>{msg}</Alert>}
      {cred && <Credential epId={cred.epId} password={cred.password} />}
      <div className="grid gap-3 sm:grid-cols-2">
        {f("epId", "EP student ID", { hint: "e.g. EP10001", disabled: Boolean(userId) })}
        <Field id="gradeId" label="Current grade" error={errors.gradeId} hint="Students can take published exams of their current grade.">
          <Select id="gradeId" value={v.gradeId} onChange={(e) => setV({ ...v, gradeId: e.target.value })}>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </Select>
        </Field>
        {f("fullName", "Full name")}
        {f("displayName", "Display name on leaderboards", { hint: "Shown to other students. Avoid full names if preferred." })}
        {f("whatsapp", "WhatsApp number (student or guardian)", { type: "tel", hint: "Private. Never shown on leaderboards. Not unique (siblings may share)." })}
        {f("school", "School (optional)")}
        {f("district", "District (optional)")}
      </div>
      <Button type="submit" disabled={save.busy}>
        {userId ? "Save changes" : "Create student"}
      </Button>
    </ClientForm>
  );
}

export function StudentActions({ userId, epId, disabled }: { userId: string; epId: string; disabled: boolean }) {
  const router = useRouter();
  const [cred, setCred] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const cmd = useMutation(studentsApi.command, { fallback: "Failed." });
  const call = async (body: Parameters<typeof studentsApi.command>[1], confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    const r = await cmd.run(userId, body);
    if (!r) return;
    if (r.temporaryPassword) setCred(r.temporaryPassword);
    setPw("");
    router.refresh();
  };
  return (
    <div className="space-y-3">
      {cmd.error && <Alert kind="danger">{cmd.error}</Alert>}
      {cred && <Credential epId={epId} password={cred} />}
      <Button
        variant={disabled ? "secondary" : "danger"}
        disabled={cmd.busy}
        onClick={() => call({ action: disabled ? "enable" : "disable" }, disabled ? "Enable this account?" : "Disable this account? The student is signed out immediately and cannot start exams. An exam already in progress ends at its deadline with the saved answers.")}
      >
        {disabled ? "Enable account" : "Disable account"}
      </Button>
      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="text-sm font-semibold">Sensitive actions (confirm with your password)</p>
        <Field id="adminPassword" label="Your password">
          <Input id="adminPassword" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!pw || cmd.busy} onClick={() => call({ action: "reset-password", adminPassword: pw }, "Reset this student's password? All their sessions are signed out.")}>
            Reset password
          </Button>
          <Button
            variant="danger"
            disabled={!pw || cmd.busy}
            onClick={() => call({ action: "pseudonymise", adminPassword: pw }, "Remove personal details permanently? Name, contact and school are erased; exam history is kept anonymously; the account is disabled. This cannot be undone.")}
          >
            Remove personal data
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Credentials file is generated in the browser from the one-time response; nothing is stored. */
function downloadCredentials(res: BulkResult) {
  const csv = "\uFEFFep_id,temporary_password\r\n" + res.credentials.map((c) => `${c.epId},${c.temporaryPassword}`).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "new-student-credentials.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

export function BulkRegistration() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<BulkResult | null>(null);
  const bulk = useMutation(studentsApi.bulk, { fallback: "Failed." });
  const send = async (commit: boolean) => {
    if (!file) return;
    const r = await bulk.run(file, commit);
    if (!r) return;
    setRes(r);
    if (r.committed) router.refresh();
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Separate from question import. Columns: ep_id, full_name, display_name, grade (6–11), whatsapp, school, district.{" "}
        <a className="underline" href="/api/v1/admin/templates/students-template.csv">Download template</a>
      </p>
      <label htmlFor="bulk-file" className="sr-only">Student CSV</label>
      <input id="bulk-file" type="file" accept=".csv,text/csv" className="min-h-11 text-sm" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); }} />
      <div className="flex gap-2">
        <Button variant="secondary" disabled={!file || bulk.busy} onClick={() => send(false)}>
          Validate
        </Button>
        <Button disabled={!file || bulk.busy || !res || res.errorCount > 0 || res.committed} onClick={() => send(true)}>
          Create all students
        </Button>
      </div>
      {bulk.error && <Alert kind="danger">{bulk.error}</Alert>}
      {res && !res.committed && (
        <Alert kind={res.errorCount ? "danger" : "ok"}>
          {res.errorCount ? `${res.errorCount} row(s) have errors. Nothing was created.` : `${res.results.length} rows are valid. Press “Create all students”.`}
        </Alert>
      )}
      {res && res.results.some((r) => r.errors.length) && (
        <Table caption="Row errors">
          <thead>
            <tr>
              <th>Row</th>
              <th>EP ID</th>
              <th>Problem</th>
            </tr>
          </thead>
          <tbody>
            {res.results
              .filter((r) => r.errors.length)
              .map((r) => (
                <tr key={r.rowNumber}>
                  <td>{r.rowNumber}</td>
                  <td>{r.epId}</td>
                  <td>{r.errors.join(" ")}</td>
                </tr>
              ))}
          </tbody>
        </Table>
      )}
      {res?.committed && (
        <Alert kind="ok" title={`${res.credentials.length} students created`}>
          <p>Download the temporary passwords now; they are not shown again.</p>
          <Button className="mt-2" onClick={() => downloadCredentials(res)}>
            Download credentials CSV
          </Button>
        </Alert>
      )}
    </div>
  );
}

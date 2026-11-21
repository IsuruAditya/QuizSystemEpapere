import Link from "next/link";
import { BulkRegistration, StudentForm } from "@/components/admin/student-forms";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Pager, Select, Table } from "@/components/ui";
import { listStudents } from "@/server/users/students";
import { examFormOptions } from "@/server/catalog/form-options";

type SP = { q?: string; gradeId?: string; status?: string; page?: string };

export default async function Students({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = sp.status === "enabled" || sp.status === "disabled" ? sp.status : undefined;
  const [r, o] = await Promise.all([listStudents({ search: sp.q?.slice(0, 60) || undefined, gradeId: sp.gradeId || undefined, status, page, pageSize: 50 }), examFormOptions()]);
  const pages = Math.max(1, Math.ceil(r.total / 50));
  return (
    <>
      <PageHeader title="Students" subtitle="Access rule: an enabled student can take every published exam of their current grade." />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section>
          <form className="mb-3 grid gap-2 sm:grid-cols-4" role="search">
            <Input id="q" name="q" defaultValue={sp.q} placeholder="EP ID or name" aria-label="Search students" />
            <Select id="gradeId" name="gradeId" defaultValue={sp.gradeId ?? ""} aria-label="Grade">
              <option value="">All grades</option>
              {o.grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </Select>
            <Select id="status" name="status" defaultValue={status ?? ""} aria-label="Account status">
              <option value="">Any status</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </Select>
            <Button type="submit" variant="secondary">Filter</Button>
          </form>
          {r.items.length === 0 ? (
            <EmptyState>No students found. Create one or upload a registration CSV.</EmptyState>
          ) : (
            <Table caption="Students">
              <thead>
                <tr>
                  <th>EP ID</th>
                  <th>Name</th>
                  <th>Grade</th>
                  <th>WhatsApp</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {r.items.map((s) => (
                  <tr key={s.userId}>
                    <td>
                      <Link className="font-mono font-semibold underline" href={`/admin/students/${s.userId}`}>
                        {s.epId}
                      </Link>
                    </td>
                    <td>
                      {s.fullName} <span className="text-xs text-muted">({s.displayName})</span>
                    </td>
                    <td>{s.grade.level}</td>
                    <td className="font-mono text-xs">{s.whatsappE164 ?? "—"}</td>
                    <td>
                      {s.pseudonymisedAt ? <Badge kind="muted">Removed</Badge> : s.user.disabled ? <Badge kind="danger">Disabled</Badge> : <Badge kind="ok">Enabled</Badge>}
                      {s.user.mustChangePassword && !s.user.disabled && <span className="ml-1 text-xs text-muted">temp password</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pager page={page} pages={pages} hrefFor={(p) => `/admin/students?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.gradeId ? { gradeId: sp.gradeId } : {}), ...(status ? { status } : {}), page: String(p) })}`} label={`Page ${page} of ${pages} · ${r.total} students`} />
        </section>
        <aside className="space-y-4">
          <Card>
            <h2 className="mb-3 font-bold">Add a student</h2>
            {o.grades.length ? <StudentForm userId={null} grades={o.grades} initial={{ epId: "", fullName: "", displayName: "", gradeId: o.grades[0]!.id, whatsapp: "", school: "", district: "" }} /> : <p>Add grades in Settings first.</p>}
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">Bulk registration (CSV)</h2>
            <BulkRegistration />
          </Card>
        </aside>
      </div>
    </>
  );
}

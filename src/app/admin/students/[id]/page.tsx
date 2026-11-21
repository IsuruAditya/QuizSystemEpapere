import Link from "next/link";
import { notFound } from "next/navigation";
import { StudentActions, StudentForm } from "@/components/admin/student-forms";
import { Badge, ButtonLink, Card, PageHeader, Table } from "@/components/ui";
import { examFormOptions } from "@/server/catalog/form-options";
import { getStudentDetail } from "@/server/users/students";
import { requireUuid } from "@/server/http/page";
import { formatColombo } from "@/lib/time";

export default async function StudentDetail({ params }: { params: Promise<{ id: string }> }) {
  const id = requireUuid((await params).id);
  const [d, o] = await Promise.all([getStudentDetail(id), examFormOptions()]);
  if (!d) notFound();
  const { profile: s, attempts, events } = d;
  return (
    <>
      <PageHeader title={`${s.epId} · ${s.fullName}`} subtitle={s.user.disabled ? "Account disabled" : "Account enabled"} actions={<ButtonLink variant="secondary" href="/admin/students">All students</ButtonLink>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <StudentForm userId={id} grades={o.grades} initial={{ epId: s.epId, fullName: s.fullName, displayName: s.displayName, gradeId: s.gradeId, whatsapp: s.whatsappE164 ?? "", school: s.school ?? "", district: s.district ?? "" }} />
          </Card>
          <section>
            <h2 className="mb-2 font-bold">Attempts</h2>
            <Table caption="Attempts">
              <thead>
                <tr>
                  <th>Exam</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link className="underline" href={`/admin/exams/${a.exam.id}/results`}>
                        {a.exam.title}
                      </Link>
                    </td>
                    <td>{a.kind}</td>
                    <td>
                      <Badge kind={a.voidedAt ? "danger" : "muted"}>{a.voidedAt ? "VOID" : a.status}</Badge>
                    </td>
                    <td>{a.score === null ? "—" : `${a.score}/${a.maxScore}`}</td>
                    <td className="text-xs">{formatColombo(a.startedAt, "en")}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>
        </div>
        <aside className="space-y-4">
          <Card>
            <h2 className="mb-3 font-bold">Account</h2>
            <StudentActions userId={id} epId={s.epId} disabled={s.user.disabled} />
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">Audit history</h2>
            <ul className="text-sm">
              {events.map((e, i) => (
                <li key={i}>
                  {formatColombo(e.createdAt, "en")} — {e.action}
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}

import Link from "next/link";
import { Badge, Button, ButtonLink, EmptyState, Input, PageHeader, Pager, Select, Table } from "@/components/ui";
import { adminExamList } from "@/server/catalog/admin-queries";
import { listCatalog } from "@/server/catalog/catalog";
import { formatColombo } from "@/lib/time";

type SP = { q?: string; gradeId?: string; subjectId?: string; status?: string; page?: string };

export default async function AdminExams({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const status = ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(sp.status ?? "") ? (sp.status as "DRAFT") : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const [list, cat] = await Promise.all([adminExamList({ q: sp.q?.slice(0, 100), gradeId: sp.gradeId || undefined, subjectId: sp.subjectId || undefined, status, page }), listCatalog()]);
  const qs = (p: number) => `/admin/exams?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.gradeId ? { gradeId: sp.gradeId } : {}), ...(sp.subjectId ? { subjectId: sp.subjectId } : {}), ...(status ? { status } : {}), page: String(p) })}`;
  return (
    <>
      <PageHeader title="Exams" actions={<ButtonLink href="/admin/exams/new">New exam</ButtonLink>} />
      <form className="mb-4 grid gap-2 sm:grid-cols-5" role="search">
        <Input id="q" name="q" placeholder="Search title" defaultValue={sp.q} aria-label="Search title" />
        <Select id="gradeId" name="gradeId" defaultValue={sp.gradeId ?? ""} aria-label="Grade">
          <option value="">All grades</option>
          {cat.grades.map((g) => (
            <option key={g.id} value={g.id}>
              Grade {g.level}
            </option>
          ))}
        </Select>
        <Select id="subjectId" name="subjectId" defaultValue={sp.subjectId ?? ""} aria-label="Subject">
          <option value="">All subjects</option>
          {cat.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nameEn}
            </option>
          ))}
        </Select>
        <Select id="status" name="status" defaultValue={status ?? ""} aria-label="Status">
          <option value="">Any status</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      {list.items.length === 0 ? (
        <EmptyState>No exams match. Create one with “New exam”.</EmptyState>
      ) : (
        <Table caption="Exams" columns={["Title", "Grade · subject", "Mode", "Status", "Window (Colombo)", "Questions", "Attempts"]}>
          <tbody>
            {list.items.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link className="font-semibold text-brand underline-offset-4 hover:underline" href={`/admin/exams/${e.id}`}>
                    {e.title}
                  </Link>
                </td>
                <td>
                  {e.grade.level} · {e.subject.nameEn}
                </td>
                <td>{e.mode}</td>
                <td>
                  <Badge kind={e.status === "PUBLISHED" ? "ok" : e.status === "DRAFT" ? "warn" : "muted"}>{e.status}</Badge>
                </td>
                <td className="text-xs">
                  {formatColombo(e.opensAt, "en") || "—"} → {formatColombo(e.closesAt, "en") || "—"}
                </td>
                <td>{e._count.draftItems}</td>
                <td>{e._count.attempts}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} pages={list.pages} hrefFor={qs} label={`Page ${page} of ${list.pages} · ${list.total} exams`} />
    </>
  );
}

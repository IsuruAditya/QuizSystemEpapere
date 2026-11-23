import Link from "next/link";
import { Button, ButtonLink, EmptyState, Input, PageHeader, Pager, Table } from "@/components/ui";
import { listQuestions } from "@/server/authoring/questions";

export default async function QuestionBank({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const r = await listQuestions({ search: sp.q?.slice(0, 100) || undefined, page, pageSize: 25 });
  const pages = Math.max(1, Math.ceil(r.total / 25));
  return (
    <>
      <PageHeader title="Question bank" subtitle="Editing a question creates a new version. Published exams keep the version they were published with." actions={<ButtonLink href="/admin/questions/new">New question</ButtonLink>} />
      <form className="mb-4 flex gap-2" role="search">
        <Input id="q" name="q" defaultValue={sp.q} placeholder="Search text or external ID" aria-label="Search questions" />
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      {r.items.length === 0 ? (
        <EmptyState>No questions found.</EmptyState>
      ) : (
        <Table caption="Questions" columns={["Question", "External ID", "Marks", "Topic", "Version", "Used in published exams"]}>
          <tbody>
            {r.items.map((q) => (
              <tr key={q.id}>
                <td className="max-w-md">
                  <Link className="line-clamp-2 font-semibold text-brand underline-offset-4 hover:underline" href={`/admin/questions/${q.id}`}>
                    {q.stem || "(image question)"}
                  </Link>
                </td>
                <td>{q.externalId ?? "—"}</td>
                <td>{q.marks}</td>
                <td>{q.topic ?? "—"}</td>
                <td>v{q.versionNo}</td>
                <td>{q.usedInPublished}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} pages={pages} hrefFor={(p) => `/admin/questions?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(p) })}`} label={`Page ${page} of ${pages}`} />
    </>
  );
}

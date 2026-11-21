import Link from "next/link";
import { notFound } from "next/navigation";
import { ExamCommandButton } from "@/components/admin/action-button";
import { DraftQuestions } from "@/components/admin/draft-questions";
import { ExamForm } from "@/components/admin/exam-form";
import { Alert, Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { examFormOptions } from "@/server/catalog/form-options";
import { getExamForEditor } from "@/server/authoring/exam-views";
import { requireUuid } from "@/server/http/page";

export default async function ExamDetail({ params }: { params: Promise<{ id: string }> }) {
  const id = requireUuid((await params).id);
  const [e, o] = await Promise.all([getExamForEditor(id), examFormOptions()]);
  if (!e) notFound();
  const draft = e.status === "DRAFT";
  return (
    <>
      <PageHeader
        title={e.title}
        subtitle={
          <>
            <Badge kind={e.status === "PUBLISHED" ? "ok" : draft ? "warn" : "muted"}>{e.status}</Badge> {e.mode} · {e.attemptCount} attempt(s)
          </>
        }
        actions={
          <>
            <ButtonLink variant="secondary" href={`/admin/exams/${id}/preview`}>Preview</ButtonLink>
            {!draft && <ButtonLink variant="secondary" href={`/admin/exams/${id}/results`}>Results</ButtonLink>}
            <ExamCommandButton examId={id} command="duplicate" label="Duplicate" confirm="Create a new draft exam (with its own leaderboard) using this exam's settings and questions?" />
            {e.status === "PUBLISHED" && e.attemptCount === 0 && <ExamCommandButton examId={id} command="unpublish" label="Unpublish" confirm="Return this exam to draft? Students will no longer see it." />}
            {e.status === "PUBLISHED" && <ExamCommandButton examId={id} command="archive" label="Archive" variant="danger" confirm="Archive this exam? It disappears from student dashboards; results are kept." />}
          </>
        }
      />
      {!draft && (
        <Card className="mb-5">
          <p className="text-sm font-semibold">Share link</p>
          <p className="break-all font-mono text-sm">{e.shareLink}</p>
          <p className="mt-1 text-xs text-muted">
            Published version {e.version?.versionNo}: {e.version?.questionCount} questions, {e.version?.totalMarks} marks.
          </p>
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <section aria-labelledby="settings-h">
          <h2 id="settings-h" className="mb-3 text-lg font-bold">Settings</h2>
          <ExamForm examId={id} published={!draft} {...o} initial={e.settings} />
        </section>
        <section aria-labelledby="q-h" className="space-y-4">
          <h2 id="q-h" className="text-lg font-bold">Questions</h2>
          {draft ? (
            <>
              <ButtonLink variant="secondary" href={`/admin/exams/${id}/import`}>Import questions from CSV</ButtonLink>
              <DraftQuestions examId={id} initial={e.draftItems} />
              <Card>
                <h3 className="font-bold">Publish</h3>
                {e.issues.length ? (
                  <Alert kind="warn" title="Fix before publishing" className="mt-2">
                    <ul className="list-disc pl-5">
                      {e.issues.map((i, k) => (
                        <li key={k}>
                          {i.position !== null ? `Question ${i.position + 1}: ` : ""}
                          {i.message}
                        </li>
                      ))}
                    </ul>
                  </Alert>
                ) : (
                  <p className="mt-1 text-sm text-muted">Publishing freezes these questions and answer keys into an immutable version. Check the preview first.</p>
                )}
                <div className="mt-3 flex gap-2">
                  <Link href={`/admin/exams/${id}/preview`} className="min-h-11 rounded-lg px-3 py-2.5 text-sm font-semibold underline">
                    Preview first
                  </Link>
                  {e.issues.length === 0 && <ExamCommandButton examId={id} command="publish" label="Publish exam" variant="primary" confirm="Publish now? Questions and answer keys can no longer be edited (corrections go through an audited regrade)." />}
                </div>
              </Card>
            </>
          ) : (
            <p className="text-sm text-muted">Questions are frozen in the published version. Use Preview to review them or Results → “Correct an answer key” for audited key fixes.</p>
          )}
        </section>
      </div>
    </>
  );
}

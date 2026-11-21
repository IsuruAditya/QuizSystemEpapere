import { notFound } from "next/navigation";
import { ImportWorkspace } from "@/components/admin/import-workspace";
import { Alert, ButtonLink, PageHeader } from "@/components/ui";
import { env } from "@/server/env";
import { getExamSummary } from "@/server/authoring/exam-views";
import { getImport } from "@/server/imports/imports";
import { requireUuid } from "@/server/http/page";

export default async function ImportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ importId?: string }> }) {
  const id = requireUuid((await params).id);
  const { importId } = await searchParams;
  const e = await getExamSummary(id);
  if (!e) notFound();
  const existing = importId && /^[0-9a-f-]{36}$/i.test(importId) ? await getImport(importId).catch(() => null) : null;
  return (
    <>
      <PageHeader title="Import questions" subtitle={e.title} actions={<ButtonLink variant="secondary" href={`/admin/exams/${id}`}>Back to exam</ButtonLink>} />
      {e.status !== "DRAFT" ? (
        <Alert kind="warn">This exam is published. Imports only go into draft exams; duplicate the exam to use a different paper.</Alert>
      ) : (
        <ImportWorkspace examId={id} maxKb={Math.round(env().IMPORT_MAX_BYTES / 1024)} initial={existing && existing.targetExamId === id ? existing : null} />
      )}
    </>
  );
}

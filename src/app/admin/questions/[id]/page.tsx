import { notFound } from "next/navigation";
import { QuestionForm } from "@/components/admin/question-form";
import { PageHeader } from "@/components/ui";
import { getQuestionForEdit } from "@/server/authoring/questions";
import { safeReturnTo } from "@/lib/return-to";
import { requireUuid } from "@/server/http/page";

export default async function EditQuestion({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const id = requireUuid((await params).id);
  const { returnTo } = await searchParams;
  const q = await getQuestionForEdit(id).catch(() => null);
  if (!q) notFound();
  const back = returnTo ? safeReturnTo(returnTo) : null;
  return (
    <>
      <PageHeader title={`Edit question${q.externalId ? ` ${q.externalId}` : ""}`} subtitle={`Current version v${q.versionNo}. Saving creates v${q.versionNo + 1}; draft exams using this question switch to it, published exams do not change.`} />
      <QuestionForm
        questionId={id}
        externalId={q.externalId}
        addToExam={null}
        returnTo={back && back !== "/" ? back : null}
        initial={{ ...q.input, stemMediaId: q.input.stemMediaId ?? null, options: q.input.options.map((o) => ({ text: o.text ?? null, mediaId: o.mediaId ?? null })), explanation: q.input.explanation ?? null, topic: q.input.topic ?? null, difficulty: q.input.difficulty ?? null }}
      />
    </>
  );
}

import { QuestionForm } from "@/components/admin/question-form";
import { PageHeader } from "@/components/ui";
import { safeReturnTo } from "@/lib/return-to";

export default async function NewQuestion({ searchParams }: { searchParams: Promise<{ addToExam?: string }> }) {
  const { addToExam } = await searchParams;
  const exam = addToExam && /^[0-9a-f-]{36}$/i.test(addToExam) ? addToExam : null;
  return (
    <>
      <PageHeader title="New question" subtitle={exam ? "It will be added to the end of the draft exam." : undefined} />
      <QuestionForm
        questionId={null}
        externalId={null}
        addToExam={exam}
        returnTo={exam ? safeReturnTo(`/admin/exams/${exam}`) : null}
        initial={{ stem: "", stemMediaId: null, options: [0, 1, 2, 3].map(() => ({ text: "", mediaId: null })), correctIndex: 0, marks: 1, explanation: null, topic: null, difficulty: null }}
      />
    </>
  );
}

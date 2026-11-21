import { ExamForm } from "@/components/admin/exam-form";
import { Alert, PageHeader } from "@/components/ui";
import { examFormOptions } from "@/server/catalog/form-options";

export default async function NewExam() {
  const o = await examFormOptions();
  if (!o.grades.length || !o.subjects.length) return <Alert kind="warn">Add at least one grade and subject in Settings first.</Alert>;
  return (
    <>
      <PageHeader title="New exam" subtitle="Defaults: 60 minutes; ranked results show the score immediately and answers after the exam closes." />
      <ExamForm
        examId={null}
        published={false}
        {...o}
        initial={{
          title: "",
          description: "",
          instructions: "",
          gradeId: o.grades[0]!.id,
          subjectId: o.subjects[0]!.id,
          teacherId: null,
          coverMediaId: null,
          mode: "RANKED",
          durationMinutes: 60,
          opensAt: null,
          closesAt: null,
          allowLateStart: true,
          maxAttempts: null,
          scoreVisibility: "IMMEDIATE",
          correctnessVisibility: "AFTER_RELEASE",
          answerVisibility: "AFTER_RELEASE",
          explanationVisibility: "AFTER_RELEASE",
          reviewReleaseAt: null,
          leaderboardVisibility: "STUDENTS",
        }}
      />
    </>
  );
}

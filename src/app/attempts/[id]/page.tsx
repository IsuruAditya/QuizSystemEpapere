import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getT, requirePage, requireUuid } from "@/server/http/page";
import { getAttemptForStudent } from "@/server/assessment/attempts";
import { AppError } from "@/server/http/app-error";
import { ExamRunner } from "@/components/exam/exam-runner";

export const metadata: Metadata = { title: "Exam in progress" };
export const dynamic = "force-dynamic";

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const id = requireUuid((await params).id);
  const actor = await requirePage("STUDENT", `/attempts/${id}`);
  const { lang } = await getT();
  let view;
  try {
    view = await getAttemptForStudent(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  if (view.status !== "IN_PROGRESS" || view.voided) redirect(`/attempts/${id}/result`);
  return <ExamRunner initial={view} userId={actor.userId} lang={lang} />;
}

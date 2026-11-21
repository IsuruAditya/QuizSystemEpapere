import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { getT, requirePage } from "@/server/http/page";
import { studentDashboard } from "@/server/catalog/student-exams";
import { formatColombo, formatDuration } from "@/lib/time";

export const metadata: Metadata = { title: "My exams" };
export const dynamic = "force-dynamic";

export default async function StudentHome() {
  const actor = await requirePage("STUDENT", "/student");
  const { lang, tr } = await getT();
  const d = await studentDashboard(actor.userId);
  const groups = (["OPEN", "UPCOMING", "CLOSED"] as const).map((g) => ({ g, items: d.exams.filter((e) => e.availability === g) }));
  const label = { OPEN: tr("openNow"), UPCOMING: tr("upcoming"), CLOSED: tr("closed") };
  return (
    <>
      <AppHeader actor={actor} />
      <main id="main" className="mx-auto max-w-4xl px-3 py-6 sm:px-5">
        <PageHeader title={tr("myExams")} subtitle={`${tr("welcome", { name: d.displayName })} · ${d.grade ? tr("gradeLabel", { grade: d.grade }) : ""}`} />
        {d.exams.length === 0 && <EmptyState>{tr("noExams")}</EmptyState>}
        {groups.map(({ g, items }) =>
          items.length ? (
            <section key={g} className="mb-8" aria-labelledby={`h-${g}`}>
              <h2 id={`h-${g}`} className="mb-3 text-lg font-bold">
                {label[g]}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {items.map((e) => (
                  <li key={e.slug}>
                    <Card className="h-full">
                      <div className="flex items-start gap-3">
                        {e.teacherPhotoId && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/v1/media/${e.teacherPhotoId}`} alt="" width={48} height={48} className="size-12 rounded-full object-cover" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap gap-1.5">
                            <Badge kind={e.mode === "RANKED" ? "info" : "muted"}>{e.mode === "RANKED" ? tr("ranked") : tr("practice")}</Badge>
                            <Badge kind="muted">{lang === "si" ? e.subjectSi : e.subjectEn}</Badge>
                          </div>
                          <h3 className="font-bold">
                            <Link href={`/exams/${e.slug}`} className="underline-offset-2 hover:underline">
                              {e.title}
                            </Link>
                          </h3>
                          <p className="text-sm text-muted">
                            {tr("questionsCount", { count: e.questionCount })} · {tr("marksCount", { count: e.totalMarks })} · {formatDuration(e.durationSeconds, lang)}
                          </p>
                          {e.teacherName && <p className="text-sm text-muted">{e.teacherName}</p>}
                          <p className="mt-1 text-sm">
                            {g === "UPCOMING" && e.opensAt && `${tr("opens")}: ${formatColombo(e.opensAt, lang)}`}
                            {g === "OPEN" && e.closesAt && `${tr("closes")}: ${formatColombo(e.closesAt, lang)}`}
                          </p>
                          {e.myAttempt && e.myAttempt.status !== "IN_PROGRESS" && (
                            <Link href={`/attempts/${e.myAttempt.id}/result`} className="mt-2 inline-block text-sm font-semibold text-brand underline">
                              {tr("viewResult")}
                            </Link>
                          )}
                        </div>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ) : null,
        )}
      </main>
    </>
  );
}

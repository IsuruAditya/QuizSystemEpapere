import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Badge, buttonClass, cx, EmptyState } from "@/components/ui";
import { IconChevronRight, IconClock, IconQuestions } from "@/components/ui/icons";
import { getT, requirePage } from "@/server/http/page";
import { studentDashboard, type StudentExamCard } from "@/server/catalog/student-exams";
import { formatColombo, formatDuration } from "@/lib/time";
import type { T } from "@/lib/i18n/dictionaries";

export const metadata: Metadata = { title: "My exams" };
export const dynamic = "force-dynamic";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function ExamCard({ e, lang, tr }: { e: StudentExamCard; lang: "si" | "en"; tr: T }) {
  const inProgress = e.myAttempt?.status === "IN_PROGRESS";
  const finished = Boolean(e.myAttempt && !inProgress);
  const avail = { OPEN: { kind: "ok" as const, label: tr("openNow") }, UPCOMING: { kind: "info" as const, label: tr("upcoming") }, CLOSED: { kind: "muted" as const, label: tr("closed") } }[e.availability];
  const cta = inProgress ? tr("actionContinue") : e.availability === "OPEN" && !finished ? tr("actionStart") : tr("actionDetails");
  return (
    <article className="group relative flex h-full flex-col rounded-2xl border border-border bg-bg p-4 shadow-card transition-colors hover:border-brand sm:p-5">
      <div className="flex items-start gap-3">
        {e.teacherPhotoId ? (
          // eslint-disable-next-line @next/next/no-img-element -- authorised media route
          <img src={`/api/v1/media/${e.teacherPhotoId}`} alt="" width={44} height={44} className="size-11 shrink-0 rounded-full object-cover" />
        ) : (
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand">
            {initials(e.teacherName ?? e.title)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            <Badge kind={avail.kind} dot>
              {avail.label}
            </Badge>
            {inProgress && <Badge kind="warn">{tr("statusInProgress")}</Badge>}
            {finished && <Badge kind="ok">{tr("statusCompleted")}</Badge>}
            <Badge kind="muted">{e.mode === "RANKED" ? tr("ranked") : tr("practice")}</Badge>
          </div>
          <h3 className="text-base font-bold leading-snug">
            {/* Stretched link: the whole card opens the exam (one tab stop). */}
            <Link href={`/exams/${e.slug}`} className="after:absolute after:inset-0 after:rounded-2xl after:content-['']">
              {e.title}
            </Link>
          </h3>
          <p className="text-sm text-muted">
            {lang === "si" ? e.subjectSi : e.subjectEn}
            {e.teacherName ? ` · ${e.teacherName}` : ""}
          </p>
        </div>
      </div>
      <dl className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <div className="flex items-center gap-1.5">
          <IconQuestions size={16} />
          <dt className="sr-only">{tr("questionsLabel")}</dt>
          <dd>
            {tr("questionsCount", { count: e.questionCount })} · {tr("marksCount", { count: e.totalMarks })}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <IconClock size={16} />
          <dt className="sr-only">{tr("duration")}</dt>
          <dd>{formatDuration(e.durationSeconds, lang)}</dd>
        </div>
      </dl>
      {(e.availability === "UPCOMING" && e.opensAt) || (e.availability === "OPEN" && e.closesAt) ? (
        <p className="mt-1 text-sm">
          {e.availability === "UPCOMING" ? `${tr("opens")}: ${formatColombo(e.opensAt, lang)}` : `${tr("closes")}: ${formatColombo(e.closesAt, lang)}`}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {finished && e.myAttempt ? (
          <Link href={`/attempts/${e.myAttempt.id}/result`} className={cx(buttonClass("primary", "md"), "relative z-10 flex-1 sm:flex-none")}>
            {tr("viewResult")}
          </Link>
        ) : (
          <span aria-hidden className={cx(buttonClass(e.availability === "OPEN" ? "primary" : "secondary", "md"), "flex-1 sm:flex-none")}>
            {cta}
            <IconChevronRight size={16} />
          </span>
        )}
      </div>
    </article>
  );
}

export default async function StudentHome() {
  const actor = await requirePage("STUDENT", "/student");
  const { lang, tr } = await getT();
  const d = await studentDashboard(actor.userId);
  const groups = (["OPEN", "UPCOMING", "CLOSED"] as const).map((g) => ({ g, items: d.exams.filter((e) => e.availability === g) }));
  const label = { OPEN: tr("openNow"), UPCOMING: tr("upcoming"), CLOSED: tr("closed") };
  return (
    <>
      <AppHeader actor={actor} />
      <main id="main" className="mx-auto max-w-6xl px-3 pb-10 pt-4 sm:px-5 sm:pt-6">
        <section className="hero mb-6 rounded-3xl p-5 shadow-card sm:p-7" aria-labelledby="dash-title">
          <p className="text-sm font-semibold text-white/85">{d.grade ? tr("gradeLabel", { grade: d.grade }) : ""}</p>
          <h1 id="dash-title" className="mt-1 text-2xl font-bold sm:text-3xl">
            {tr("welcome", { name: d.displayName })}
          </h1>
          <p className="mt-1 text-white/90">{tr("heroTagline")}</p>
        </section>
        <h2 className="sr-only">{tr("myExams")}</h2>
        {d.exams.length === 0 && <EmptyState>{tr("noExams")}</EmptyState>}
        {groups.map(({ g, items }) =>
          items.length ? (
            <section key={g} className="mb-8" aria-labelledby={`h-${g}`}>
              <h2 id={`h-${g}`} className="mb-3 flex items-center gap-2 text-lg font-bold">
                {label[g]} <span className="rounded-full bg-surface-2 px-2 text-sm font-semibold text-muted">{items.length}</span>
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((e) => (
                  <li key={e.slug}>
                    <ExamCard e={e} lang={lang} tr={tr} />
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

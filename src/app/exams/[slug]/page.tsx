import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Alert, Badge, ButtonLink, Card } from "@/components/ui";
import { IconCheck, IconTrophy } from "@/components/ui/icons";
import { MathText } from "@/components/math-text";
import { getT, requirePage } from "@/server/http/page";
import { examLanding } from "@/server/catalog/exam-landing";
import { formatColombo, formatDuration } from "@/lib/time";
import { StartButton } from "./start-button";

export const metadata: Metadata = { title: "Exam" };
export const dynamic = "force-dynamic";

export default async function ExamLanding({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await requirePage("ANY", `/exams/${slug}`);
  const { lang, tr } = await getT();
  const d = await examLanding(slug, actor.userId);
  if (!d) notFound();
  const e = d.exam;
  const rel = d.releaseAt ? formatColombo(d.releaseAt, lang) : "";
  const reviewLine =
    e.correctnessVisibility === "IMMEDIATE" && e.explanationVisibility === "IMMEDIATE"
      ? tr("ruleReviewImmediate")
      : e.correctnessVisibility === "NEVER"
        ? tr("reviewNever")
        : e.scoreVisibility === "IMMEDIATE"
          ? tr("ruleReviewLater", { time: rel })
          : tr("ruleScoreLater", { time: rel });
  const blockedMsg: Record<string, string> = {
    NOT_OPEN: tr("notOpenYet", { time: formatColombo(e.opensAt, lang) }),
    CLOSED: tr("examClosed"),
    NO_ATTEMPTS: tr("noAttemptsLeft"),
    LATE_NOT_ALLOWED: tr("examClosed"),
    GRADE_MISMATCH: tr("notEligible"),
    NOT_STUDENT: tr("accessDenied"),
    DISABLED: tr("accessDenied"),
    NO_PROFILE: tr("notEligible"),
    NOT_PUBLISHED: tr("notFound"),
  };
  // Localised messages for start failures (server titles are English).
  const startMessages = { NOT_OPEN: blockedMsg.NOT_OPEN, CLOSED: tr("examClosed"), NO_ATTEMPTS_REMAINING: tr("noAttemptsLeft"), ACCESS_DENIED: tr("notEligible"), default: tr("somethingWrong") };
  const canStart = actor.role === "STUDENT" && (Boolean(d.activeAttemptId) || !d.blocked);
  const rules = [
    e.mode === "RANKED" ? tr("ruleOneAttempt") : tr("rulePractice"),
    e.mode === "PRACTICE" ? (d.practiceRemaining === null ? tr("ruleUnlimited") : tr("ruleAttemptsLeft", { count: d.practiceRemaining })) : null,
    e.durationSeconds !== null ? tr("ruleTimer") : null,
    e.durationSeconds !== null ? tr("ruleAutoSubmit") : null,
    tr("ruleUnanswered"),
    reviewLine,
    e.mode === "RANKED" ? tr("ruleRanking") : null,
  ].filter((r): r is string => r !== null);
  const facts: [string, string][] = [
    [tr("duration"), formatDuration(e.durationSeconds, lang)],
    [tr("questionsLabel"), String(e.currentVersion?.questionCount ?? 0)],
    [tr("marksLabel"), String(e.currentVersion?.totalMarks ?? 0)],
    [tr("closes"), e.closesAt ? formatColombo(e.closesAt, lang) : "—"],
  ];
  return (
    <>
      <AppHeader actor={actor} />
      <main id="main" className={`mx-auto grid max-w-6xl gap-5 px-3 pt-4 sm:px-5 sm:pt-6 lg:grid-cols-[1fr_22rem] lg:pb-10 ${canStart ? "pb-28" : "pb-10"}`}>
        <div className="min-w-0 space-y-5">
          <section className="overflow-hidden rounded-3xl border border-border bg-bg shadow-card" aria-labelledby="exam-title">
            {e.coverMediaId ? (
              // eslint-disable-next-line @next/next/no-img-element -- authorised media route
              <img src={`/api/v1/media/${e.coverMediaId}`} alt="" className="max-h-56 w-full object-cover" />
            ) : (
              <div aria-hidden className="hero h-3" />
            )}
            <div className="p-5 sm:p-7">
              <div className="mb-3 flex flex-wrap gap-1.5">
                <Badge kind={e.mode === "RANKED" ? "info" : "muted"}>{e.mode === "RANKED" ? tr("ranked") : tr("practice")}</Badge>
                <Badge kind="muted">{lang === "si" ? e.subject.nameSi : e.subject.nameEn}</Badge>
                <Badge kind="muted">{tr("gradeLabel", { grade: e.grade.level })}</Badge>
              </div>
              <h1 id="exam-title" className="text-2xl font-bold leading-snug sm:text-3xl">
                {e.title}
              </h1>
              {e.description && <MathText text={e.description} className="mt-2 block text-muted" />}
              {e.teacher && (
                <div className="mt-5 flex items-center gap-3 rounded-2xl bg-surface p-3">
                  {e.teacher.photoMediaId ? (
                    // eslint-disable-next-line @next/next/no-img-element -- authorised media route
                    <img src={`/api/v1/media/${e.teacher.photoMediaId}`} alt={e.teacher.name} width={64} height={64} className="size-16 rounded-full border-2 border-brand-tint object-cover" />
                  ) : null}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{tr("teacher")}</p>
                    <p className="font-bold">{e.teacher.name}</p>
                    {e.teacher.bio && <p className="text-sm text-muted">{e.teacher.bio}</p>}
                  </div>
                </div>
              )}
              <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {facts.map(([k, v]) => (
                  <div key={k} className="rounded-2xl border border-border p-3">
                    <dt className="text-xs font-semibold text-muted">{k}</dt>
                    <dd className="mt-0.5 font-bold">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <Card>
            <h2 className="mb-3 text-lg font-bold">{tr("beforeYouStart")}</h2>
            <ul className="space-y-2.5 text-sm">
              {rules.map((r) => (
                <li key={r} className="flex gap-2.5">
                  <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                    <IconCheck size={13} />
                  </span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            {e.instructions && (
              <>
                <h3 className="mt-5 font-semibold">{tr("instructions")}</h3>
                <MathText text={e.instructions} className="mt-1 block text-sm" />
              </>
            )}
          </Card>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start" aria-label={tr("start")}>
          {d.lateStart !== null && !d.blocked && (
            <Alert kind="warn" title={tr("lateStartWarning", { minutes: Math.floor(d.lateStart / 60), full: Math.round((e.durationSeconds ?? 0) / 60) })} />
          )}
          {d.blocked && <Alert kind={d.blocked === "NOT_OPEN" ? "info" : "warn"}>{blockedMsg[d.blocked]}</Alert>}
          {canStart && (
            // Phones: fixed to the bottom (thumb reach); large screens: in the side column.
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:static lg:rounded-2xl lg:border lg:p-4 lg:shadow-card">
              <StartButton slug={e.slug} label={d.activeAttemptId ? tr("resume") : tr("start")} busyLabel={tr("starting")} messages={startMessages} />
            </div>
          )}
          <div className="flex flex-col gap-2">
            {d.lastFinishedAttemptId && (
              <ButtonLink variant="secondary" href={`/attempts/${d.lastFinishedAttemptId}/result`}>
                {tr("viewResult")}
              </ButtonLink>
            )}
            {e.mode === "RANKED" && (e.leaderboardVisibility === "STUDENTS" || actor.role === "ADMIN") && (
              <ButtonLink variant="soft" href={`/exams/${e.slug}/leaderboard`}>
                <IconTrophy size={18} /> {tr("leaderboard")}
              </ButtonLink>
            )}
            <ButtonLink variant="ghost" href={actor.role === "ADMIN" ? "/admin" : "/student"}>
              {tr("backToDashboard")}
            </ButtonLink>
          </div>
        </aside>
      </main>
    </>
  );
}

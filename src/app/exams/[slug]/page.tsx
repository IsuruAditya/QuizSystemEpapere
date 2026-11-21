import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Alert, Badge, ButtonLink, Card } from "@/components/ui";
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
  return (
    <>
      <AppHeader actor={actor} />
      <main id="main" className="mx-auto max-w-3xl px-3 py-6 sm:px-5">
        {e.teacher && (
          <div className="mb-5 flex items-center gap-4">
            {e.teacher.photoMediaId && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/v1/media/${e.teacher.photoMediaId}`} alt={e.teacher.name} width={96} height={96} className="size-24 rounded-full border-4 border-brand-soft object-cover" />
            )}
            <div>
              <p className="text-sm text-muted">{tr("teacher")}</p>
              <p className="text-lg font-bold">{e.teacher.name}</p>
              {e.teacher.bio && <p className="text-sm text-muted">{e.teacher.bio}</p>}
            </div>
          </div>
        )}
        {e.coverMediaId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/v1/media/${e.coverMediaId}`} alt="" className="mb-5 max-h-56 w-full rounded-xl object-cover" />
        )}
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Badge kind={e.mode === "RANKED" ? "info" : "muted"}>{e.mode === "RANKED" ? tr("ranked") : tr("practice")}</Badge>
          <Badge kind="muted">{lang === "si" ? e.subject.nameSi : e.subject.nameEn}</Badge>
          <Badge kind="muted">{tr("gradeLabel", { grade: e.grade.level })}</Badge>
        </div>
        <h1 className="text-2xl font-bold leading-snug">{e.title}</h1>
        {e.description && <MathText text={e.description} className="mt-2 block text-muted" />}

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [tr("duration"), formatDuration(e.durationSeconds, lang)],
            [tr("questionsCount", { count: "" }).trim(), String(e.currentVersion?.questionCount ?? 0)],
            [tr("marksCount", { count: "" }).trim(), String(e.currentVersion?.totalMarks ?? 0)],
            [tr("closes"), e.closesAt ? formatColombo(e.closesAt, lang) : "—"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-surface p-3">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="font-bold">{v}</dd>
            </div>
          ))}
        </dl>

        <Card className="mt-5">
          <h2 className="mb-2 font-bold">{tr("beforeYouStart")}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>{e.mode === "RANKED" ? tr("ruleOneAttempt") : tr("rulePractice")}</li>
            {e.mode === "PRACTICE" && <li>{d.practiceRemaining === null ? tr("ruleUnlimited") : tr("ruleAttemptsLeft", { count: d.practiceRemaining })}</li>}
            {e.durationSeconds !== null && <li>{tr("ruleTimer")}</li>}
            {e.durationSeconds !== null && <li>{tr("ruleAutoSubmit")}</li>}
            <li>{tr("ruleUnanswered")}</li>
            <li>{reviewLine}</li>
            {e.mode === "RANKED" && <li>{tr("ruleRanking")}</li>}
          </ul>
          {e.instructions && (
            <>
              <h3 className="mt-4 font-semibold">{tr("instructions")}</h3>
              <MathText text={e.instructions} className="block text-sm" />
            </>
          )}
        </Card>

        <div className="mt-6 space-y-3">
          {d.lateStart !== null && !d.blocked && (
            <Alert kind="warn" title={tr("lateStartWarning", { minutes: Math.floor(d.lateStart / 60), full: Math.round((e.durationSeconds ?? 0) / 60) })} />
          )}
          {actor.role === "STUDENT" && d.activeAttemptId && <StartButton slug={e.slug} label={tr("resume")} busyLabel={tr("starting")} messages={startMessages} />}
          {actor.role === "STUDENT" && !d.activeAttemptId && !d.blocked && <StartButton slug={e.slug} label={tr("start")} busyLabel={tr("starting")} messages={startMessages} />}
          {d.blocked && <Alert kind={d.blocked === "NOT_OPEN" ? "info" : "warn"}>{blockedMsg[d.blocked]}</Alert>}
          <div className="flex flex-wrap gap-2">
            {d.lastFinishedAttemptId && <ButtonLink variant="secondary" href={`/attempts/${d.lastFinishedAttemptId}/result`}>{tr("viewResult")}</ButtonLink>}
            {e.mode === "RANKED" && (e.leaderboardVisibility === "STUDENTS" || actor.role === "ADMIN") && (
              <ButtonLink variant="secondary" href={`/exams/${e.slug}/leaderboard`}>{tr("leaderboard")}</ButtonLink>
            )}
            <ButtonLink variant="ghost" href={actor.role === "ADMIN" ? "/admin" : "/student"}>{tr("backToDashboard")}</ButtonLink>
          </div>
        </div>
      </main>
    </>
  );
}

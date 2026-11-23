import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Alert, Badge, ButtonLink, Card } from "@/components/ui";
import { MathText } from "@/components/math-text";
import { getT, requirePage, requireUuid } from "@/server/http/page";
import { getResultForStudent } from "@/server/results/review";
import { AppError } from "@/server/http/app-error";
import { formatColombo } from "@/lib/time";
import { formatElapsed } from "@/server/results/ranking-rules";
import { ResultAutoRefresh } from "./auto-refresh";

export const metadata: Metadata = { title: "Result" };
export const dynamic = "force-dynamic";

const LETTERS = ["A", "B", "C", "D"];

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const id = requireUuid((await params).id);
  const actor = await requirePage("STUDENT", `/attempts/${id}/result`);
  const { lang, tr } = await getT();
  let r;
  try {
    r = await getResultForStudent(actor.userId, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const rel = r.release.releaseAt ? formatColombo(r.release.releaseAt, lang) : "";
  return (
    <>
      <AppHeader actor={actor} />
      <main id="main" className="mx-auto max-w-3xl px-3 py-6 sm:px-5">
        <p className="text-sm text-muted">{r.exam.title}</p>
        <h1 className="text-2xl font-bold">{tr("receiptTitle")}</h1>
        {r.voided && <Alert kind="warn" className="mt-3">{tr("voidedNotice", { reason: r.voidReason ?? "" })}</Alert>}

        <section className="mt-4 overflow-hidden rounded-3xl border border-border bg-bg shadow-card" aria-label={tr("yourScore")}>
          <div className="hero p-5 sm:p-7">
            <p className="text-sm font-semibold text-white/85">{tr("yourScore")}</p>
            <p className="mt-1 text-4xl font-bold tabular-nums sm:text-5xl">
              {r.gradingState === "PENDING" ? "…" : r.score !== null ? tr("scoreOf", { score: r.score, max: r.maxScore ?? 0 }) : "—"}
            </p>
            {r.score !== null && r.percentBp !== null && <p className="mt-1 text-lg font-semibold text-white/90">{(r.percentBp / 100).toFixed(1)}%</p>}
          </div>
          <dl className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
            <div className="rounded-2xl border border-border p-3">
              <dt className="text-xs font-semibold text-muted">{tr("receivedLabel")}</dt>
              <dd className="font-semibold">{r.submittedAt ? formatColombo(r.submittedAt, lang) : "—"}</dd>
              {r.finalizeReason === "EXPIRED" && <dd className="text-xs text-muted">{tr("receiptExpired")}</dd>}
            </div>
            <div className="rounded-2xl border border-border p-3">
              <dt className="text-xs font-semibold text-muted">{tr("timeTaken")}</dt>
              <dd className="font-semibold tabular-nums">{r.elapsedMs !== null ? formatElapsed(r.elapsedMs) : "—"}</dd>
            </div>
          </dl>
          {(r.gradingState === "PENDING" || (r.gradingState === "GRADED" && !r.release.score)) && (
            <div className="px-5 pb-5 sm:px-6">
              {r.gradingState === "PENDING" && (
                <>
                  <Alert kind="info" live>{tr("scorePending")}</Alert>
                  <ResultAutoRefresh />
                </>
              )}
              {r.gradingState === "GRADED" && !r.release.score && <Alert kind="info">{tr("scoreHidden", { time: rel })}</Alert>}
            </div>
          )}
        </section>

        {r.gradingState === "GRADED" && !r.release.correctness && (
          <Alert kind="info" className="mt-4">{r.release.releaseAt ? tr("reviewHidden", { time: rel }) : tr("reviewNever")}</Alert>
        )}

        {r.questions.length > 0 && (
          <ol className="mt-6 space-y-4">
            {r.questions.map((q) => (
              <li key={q.examQuestionId}>
                <Card>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-muted">{tr("question", { n: q.position + 1 })}</span>
                    {q.selectedOptionId === null ? (
                      <Badge kind="muted">○ {tr("notAnswered")}</Badge>
                    ) : q.correct ? (
                      <Badge kind="ok">✓ {tr("correct")}</Badge>
                    ) : (
                      <Badge kind="danger">✗ {tr("incorrect")}</Badge>
                    )}
                    <span className="text-xs text-muted">
                      {q.awarded}/{q.marks}
                    </span>
                  </div>
                  <MathText text={q.stem} className="block" />
                  {q.media && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/v1/media/${q.media.id}`} alt={q.media.alt ?? ""} className="mt-2 max-h-64 rounded border border-border bg-white" />
                  )}
                  <ul className="mt-3 space-y-1.5">
                    {q.options.map((o, i) => {
                      const mine = o.id === q.selectedOptionId;
                      const right = q.correctOptionId === o.id;
                      return (
                        <li key={o.id} className={`rounded-lg border p-2 ${right ? "border-ok bg-ok-soft" : mine ? "border-danger bg-danger-soft" : "border-border"}`}>
                          <span className="font-bold">{LETTERS[i]}. </span>
                          <MathText text={o.text} />
                          {mine && <span className="ml-2 text-xs font-semibold">— {tr("yourAnswer")}</span>}
                          {right && <span className="ml-2 text-xs font-semibold">— ✓ {tr("correctAnswer")}</span>}
                        </li>
                      );
                    })}
                  </ul>
                  {q.explanation && (
                    <div className="mt-3 rounded-lg bg-surface p-3 text-sm">
                      <p className="font-semibold">{tr("explanation")}</p>
                      <MathText text={q.explanation} />
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {r.exam.mode === "RANKED" && r.kind === "OFFICIAL" && <ButtonLink href={`/exams/${r.exam.slug}/leaderboard`}>{tr("leaderboard")}</ButtonLink>}
          <ButtonLink variant="secondary" href={`/exams/${r.exam.slug}`}>{tr("backToExam")}</ButtonLink>
          <ButtonLink variant="ghost" href="/student">{tr("backToDashboard")}</ButtonLink>
        </div>
      </main>
    </>
  );
}

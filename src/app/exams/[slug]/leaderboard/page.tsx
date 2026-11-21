import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Alert, ButtonLink, EmptyState, PageHeader, Pager, Table } from "@/components/ui";
import { getT, requirePage } from "@/server/http/page";
import { getLeaderboard } from "@/server/results/leaderboard";
import { examForLeaderboard } from "@/server/results/access";
import { AppError } from "@/server/http/app-error";
import { formatElapsed } from "@/server/results/ranking-rules";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

const PAGE = 50;

export default async function LeaderboardPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> }) {
  const { slug } = await params;
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const actor = await requirePage("ANY", `/exams/${slug}/leaderboard`);
  const { tr } = await getT();
  let exam;
  try {
    exam = await examForLeaderboard(actor, slug);
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "ACCESS_DENIED")) notFound();
    throw e;
  }
  const lb = await getLeaderboard(exam.id, { page, pageSize: PAGE, viewerId: actor.userId });
  const pages = Math.max(1, Math.ceil(lb.total / PAGE));
  return (
    <>
      <AppHeader actor={actor} />
      <main id="main" className="mx-auto max-w-3xl px-3 py-6 sm:px-5">
        <PageHeader title={tr("leaderboard")} subtitle={exam.title} />
        <Alert kind={lb.status.state === "FINAL" ? "ok" : "info"} className="mb-3">
          {lb.status.state === "FINAL" ? tr("final") : tr("provisional")}
        </Alert>
        {lb.status.rankingRevision > 0 && lb.status.rankingNote && <Alert kind="warn" className="mb-3">{tr("rankingChanged", { note: lb.status.rankingNote })}</Alert>}
        <p className="mb-3 text-sm text-muted">{tr("rankingRule")}</p>
        {lb.me && (
          <p className="mb-3 rounded-lg bg-brand-soft p-3 font-semibold">
            {tr("yourRank", { rank: lb.me.rank, total: lb.total })} · {lb.me.score}/{lb.me.maxScore} · {formatElapsed(lb.me.elapsedMs)}
          </p>
        )}
        {lb.rows.length === 0 ? (
          <EmptyState>{tr("noRankings")}</EmptyState>
        ) : (
          <Table caption={tr("leaderboard")}>
            <thead>
              <tr>
                <th scope="col">{tr("rank")}</th>
                <th scope="col">{tr("name")}</th>
                <th scope="col">{tr("marks")}</th>
                <th scope="col">{tr("time")}</th>
              </tr>
            </thead>
            <tbody>
              {lb.rows.map((r) => (
                <tr key={r.attemptId} className={r.isMe ? "bg-brand-soft font-semibold" : undefined} aria-current={r.isMe ? "true" : undefined}>
                  <td>{r.rank}</td>
                  <td>{r.displayName}{r.isMe ? ` ${tr("you")}` : ""}</td>
                  <td>{r.score}/{r.maxScore}</td>
                  <td className="tabular-nums" title={`${r.elapsedMs} ms`}>{formatElapsed(r.elapsedMs)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager page={page} pages={pages} hrefFor={(p) => `/exams/${slug}/leaderboard?page=${p}`} label={tr("page", { page, pages })} />
        <div className="mt-6">
          <ButtonLink variant="secondary" href={`/exams/${slug}`}>{tr("backToExam")}</ButtonLink>
        </div>
      </main>
    </>
  );
}

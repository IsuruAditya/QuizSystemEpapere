import Link from "next/link";
import { notFound } from "next/navigation";
import { CorrectionForm, VoidForm } from "@/components/admin/sensitive-forms";
import { Alert, Badge, Button, ButtonLink, Card, EmptyState, Input, PageHeader, Pager, Select, Table } from "@/components/ui";
import { examStats, getResultsAdminView, listAttempts } from "@/server/results/admin-results";
import { requireUuid } from "@/server/http/page";
import { getLeaderboard } from "@/server/results/leaderboard";
import { formatElapsed } from "@/server/results/ranking-rules";
import { formatColombo } from "@/lib/time";

type SP = { page?: string; status?: string; q?: string };

export default async function ExamResults({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const id = requireUuid((await params).id);
  const sp = await searchParams;
  const e = await getResultsAdminView(id);
  if (!e) notFound();
  const page = Math.max(1, Number(sp.page) || 1);
  const status = ["IN_PROGRESS", "SUBMITTED", "GRADED"].includes(sp.status ?? "") ? (sp.status as "IN_PROGRESS" | "SUBMITTED" | "GRADED") : undefined;
  const [stats, attempts, lb] = await Promise.all([
    examStats(id),
    listAttempts(id, { status, search: sp.q?.slice(0, 50) || undefined, page, pageSize: 50 }),
    e.mode === "RANKED" ? getLeaderboard(id, { page: 1, pageSize: 10, viewerId: null }) : Promise.resolve(null),
  ]);
  const pages = Math.max(1, Math.ceil(attempts.total / 50));
  const r = stats.ranking;
  return (
    <>
      <PageHeader
        title={`Results: ${e.title}`}
        subtitle={`${e.mode} · ${e.status}`}
        actions={
          <>
            <ButtonLink variant="secondary" href={`/admin/exams/${id}`}>Exam settings</ButtonLink>
            {e.mode === "RANKED" && <ButtonLink variant="secondary" href={`/exams/${e.slug}/leaderboard`}>Full leaderboard</ButtonLink>}
            <a className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg" href={`/api/v1/admin/exams/${id}/results.csv`}>
              Export CSV
            </a>
          </>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-5">
        {[
          ["Started", stats.started],
          ["In progress", stats.in_progress],
          ["Graded", stats.graded],
          ["Voided", stats.voided],
          ["Mean / max / min", stats.mean === null ? "—" : `${stats.mean.toFixed(1)} / ${stats.max} / ${stats.min}`],
        ].map(([k, v]) => (
          <Card key={String(k)}>
            <p className="text-xs text-muted">{k}</p>
            <p className="text-xl font-bold">{v}</p>
          </Card>
        ))}
      </div>
      {e.mode === "RANKED" && (
        <Alert kind={r.state === "FINAL" ? "ok" : "info"} className="mb-4" title={`Ranking ${r.state.toLowerCase()} (revision ${r.rankingRevision})`}>
          {r.state === "PROVISIONAL" && <p>Pending: {r.reasons.join(", ").toLowerCase().replaceAll("_", " ")}. In progress {r.inProgress}, awaiting grading {r.ungraded}, awaiting regrade {r.staleRevision}.</p>}
          {r.rankingNote && <p>Last change: {r.rankingNote}</p>}
        </Alert>
      )}
      {lb && lb.rows.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-2 font-bold">Top 10</h2>
          <ol className="text-sm">
            {lb.rows.map((x) => (
              <li key={x.attemptId}>
                {x.rank}. {x.displayName} — {x.score}/{x.maxScore} in {formatElapsed(x.elapsedMs)}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <h2 className="mb-2 text-lg font-bold">Attempts</h2>
      <form className="mb-3 flex flex-wrap gap-2" role="search">
        <Input id="q" name="q" defaultValue={sp.q} placeholder="EP ID or name" aria-label="Search attempts" className="max-w-xs" />
        <Select id="status" name="status" defaultValue={status ?? ""} aria-label="Status" className="max-w-xs">
          <option value="">Any status</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="SUBMITTED">Submitted (awaiting grade)</option>
          <option value="GRADED">Graded</option>
        </Select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      {attempts.items.length === 0 ? (
        <EmptyState>No attempts yet.</EmptyState>
      ) : (
        <Table caption="Attempts" columns={["Student", "Status", "Started / deadline", "Last saved", "Answers (rev)", "Finalised", "Score", "Time", ""]}>
          <tbody>
            {attempts.items.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.user.profile?.epId} <span className="text-muted">{a.user.profile?.fullName}</span>
                  {a.kind === "PRACTICE" && <span className="text-xs text-muted"> #{a.attemptNo}</span>}
                </td>
                <td>
                  <Badge kind={a.voidedAt ? "danger" : a.status === "GRADED" ? "ok" : a.status === "IN_PROGRESS" ? "info" : "warn"}>{a.voidedAt ? "VOID" : a.status}</Badge>
                  {a.voidReason && <p className="text-xs text-muted">{a.voidReason}{a.replacementGranted ? " (replacement allowed)" : ""}</p>}
                  {a.replacesAttemptId && <p className="text-xs text-muted">replacement</p>}
                </td>
                <td className="text-xs">
                  {formatColombo(a.startedAt, "en")}
                  <br />→ {a.deadlineAt ? formatColombo(a.deadlineAt, "en") : "untimed"}
                </td>
                <td className="text-xs">{a.lastSavedAt ? formatColombo(a.lastSavedAt, "en") : "—"}</td>
                <td>
                  {a._count.answers} ({a.revision})
                </td>
                <td className="text-xs">{a.finalizeReason ?? "—"}</td>
                <td>{a.score === null ? (a.status === "SUBMITTED" ? "pending" : "—") : `${a.score}/${a.maxScore}`}</td>
                <td className="tabular-nums" title={a.elapsedMs !== null ? `${a.elapsedMs} ms` : undefined}>
                  {a.elapsedMs !== null ? formatElapsed(a.elapsedMs) : "—"}
                </td>
                <td>{!a.voidedAt && a.status !== "IN_PROGRESS" && <VoidForm attemptId={a.id} label={a.user.profile?.epId ?? ""} />}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} pages={pages} hrefFor={(p) => `/admin/exams/${id}/results?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(status ? { status } : {}), page: String(p) })}`} label={`Page ${page} of ${pages}`} />

      <section className="mt-8 grid gap-4 lg:grid-cols-2" aria-labelledby="corr-h">
        <Card>
          <h2 id="corr-h" className="mb-2 font-bold">Correct an answer key</h2>
          <p className="mb-3 text-sm text-muted">The published question and the original key stay in history. A new grading revision is created and every result is recalculated with it. Start/submit times and time taken never change.</p>
          <CorrectionForm examId={id} slots={e.correctionSlots} />
        </Card>
        <Card>
          <h2 className="mb-2 font-bold">Grading revisions</h2>
          <ol className="space-y-1 text-sm">
            {e.gradingRevisions.map((g) => (
              <li key={g.revisionNo}>
                <strong>#{g.revisionNo}</strong> {formatColombo(g.createdAt, "en")} — {g.reason}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted">
            <Link className="underline" href="/admin">Background job status</Link> is shown on the overview page.
          </p>
        </Card>
      </section>
    </>
  );
}

import Link from "next/link";
import { Alert, Badge, ButtonLink, Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { adminOverview } from "@/server/catalog/admin-queries";
import { formatColombo } from "@/lib/time";

export default async function AdminOverview() {
  const o = await adminOverview();
  const tone = { OPEN: "ok", UPCOMING: "info", CLOSED: "muted" } as const;
  return (
    <>
      <PageHeader title="Overview" subtitle="Figures are calculated when this page loads. Refresh to update." actions={<ButtonLink href="/admin/exams/new">New exam</ButtonLink>} />
      {(o.failedJobs.length > 0 || o.overdueUnreconciled > 0) && (
        <Alert kind="danger" title="Needs attention" className="mb-4">
          {o.overdueUnreconciled > 0 && <p>{o.overdueUnreconciled} expired attempt(s) not yet finalised for over 5 minutes. Check that the scheduled job runner is configured (docs/deployment.md).</p>}
          {o.failedJobs.map((j) => (
            <p key={j.id}>
              Job {j.type} failed after {j.attempts} attempts: {j.lastError}
            </p>
          ))}
        </Alert>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">Published exams</p>
          <p className="text-2xl font-bold">{o.exams.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Students currently in an attempt</p>
          <p className="text-2xl font-bold">{o.exams.reduce((s, e) => s + e.inProgress, 0)}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Background jobs queued</p>
          <p className="text-2xl font-bold">{o.queuedJobs}</p>
        </Card>
      </div>
      {o.recentImports.length > 0 && (
        <Alert kind="warn" title="Imports with errors waiting for fixes" className="mb-4">
          {o.recentImports.map((i) => (
            <p key={i.id}>
              <Link className="underline" href={`/admin/exams/${i.targetExamId}/import?importId=${i.id}`}>
                {i.fileName}
              </Link>{" "}
              — {i.errorCount} error(s)
            </p>
          ))}
        </Alert>
      )}
      <h2 className="mb-2 text-lg font-bold">Published exams</h2>
      {o.exams.length === 0 ? (
        <EmptyState>No published exams yet.</EmptyState>
      ) : (
        <Table caption="Published exams">
          <thead>
            <tr>
              <th>Exam</th>
              <th>Grade</th>
              <th>Status</th>
              <th>Opens / closes (Colombo)</th>
              <th>In progress</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {o.exams.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link className="font-semibold underline" href={`/admin/exams/${e.id}/results`}>
                    {e.title}
                  </Link>{" "}
                  <span className="text-xs text-muted">{e.mode}</span>
                </td>
                <td>{e.grade.level}</td>
                <td>
                  <Badge kind={tone[e.availability]}>{e.availability}</Badge>
                </td>
                <td className="text-xs">
                  {formatColombo(e.opensAt, "en") || "—"} → {formatColombo(e.closesAt, "en") || "—"}
                </td>
                <td>{e.inProgress}</td>
                <td>{e.finalized}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

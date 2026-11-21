import { notFound } from "next/navigation";
import { MathText } from "@/components/math-text";
import { Alert, Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { getExamPreview } from "@/server/authoring/exam-views";
import { requireUuid } from "@/server/http/page";

const LETTERS = ["A", "B", "C", "D"];

/** Admin preview: student layout plus the answer key and explanations (admin only). */
export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  const id = requireUuid((await params).id);
  const p = await getExamPreview(id);
  if (!p) notFound();
  return (
    <>
      <PageHeader title={`Preview: ${p.title}`} subtitle={`${p.questions.length} questions · ${p.questions.reduce((s, q) => s + q.marks, 0)} marks`} actions={<ButtonLink variant="secondary" href={`/admin/exams/${id}`}>Back to exam</ButtonLink>} />
      <Alert kind="info" className="mb-4">The highlighted answer key and explanations are visible only to administrators.</Alert>
      <ol className="space-y-4">
        {p.questions.map((q, i) => (
          <li key={q.id}>
            <Card>
              <p className="mb-2 text-sm font-bold text-muted">
                Question {i + 1} · {q.marks} mark(s)
              </p>
              <div className="text-lg">
                <MathText text={q.stem} />
              </div>
              {q.stemMedia && (
                // eslint-disable-next-line @next/next/no-img-element -- authorised API route; next/image would proxy and cache private images
                <img src={`/api/v1/media/${q.stemMedia.id}`} alt={q.stemMedia.alt ?? ""} className="mt-2 max-h-72 rounded border border-border bg-white" />
              )}
              <ul className="mt-3 space-y-1.5">
                {q.options.map((o, k) => (
                  <li key={o.id} className={`rounded-lg border p-2 ${o.isCorrect ? "border-ok bg-ok-soft" : "border-border"}`}>
                    <span className="font-bold">{LETTERS[k]}. </span>
                    <MathText text={o.text} />
                    {o.media && (
                      // eslint-disable-next-line @next/next/no-img-element -- authorised API route
                      <img src={`/api/v1/media/${o.media.id}`} alt={o.media.alt ?? ""} className="mt-1 max-h-40 rounded" />
                    )}
                    {o.isCorrect && <Badge kind="ok">✓ Key</Badge>}
                  </li>
                ))}
              </ul>
              {q.explanation && (
                <div className="mt-2 rounded bg-surface p-2 text-sm">
                  <MathText text={q.explanation} />
                </div>
              )}
            </Card>
          </li>
        ))}
      </ol>
    </>
  );
}

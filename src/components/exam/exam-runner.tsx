"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AttemptView } from "@/lib/attempt/types";
import { t, type Lang } from "@/lib/i18n/dictionaries";
import { MathText } from "../math-text";
import { Alert, Button, cx } from "../ui";
import { Countdown } from "./countdown";
import { useExamSession } from "./use-exam-session";

const LETTERS = ["A", "B", "C", "D"];
const noop = () => () => {};

/** Renders only after hydration: the runner depends on per-tab sessionStorage and local recovery data. */
export function ExamRunner(props: { initial: AttemptView; userId: string; lang: Lang }) {
  const isClient = useSyncExternalStore(noop, () => true, () => false);
  if (!isClient) return <p className="p-6 text-center text-muted" role="status">{t(props.lang)("loading")}</p>;
  return <Runner {...props} />;
}

/** Presentation only; behaviour lives in useExamSession. */
function Runner({ initial, userId, lang }: { initial: AttemptView; userId: string; lang: Lang }) {
  const tr = useMemo(() => t(lang), [lang]);
  const s = useExamSession(initial, userId, tr("leaveWarning"));
  const { answers, status, flags, clock, timeUp, submitState, onExpire, takeover, submit } = s;
  const [index, setIndex] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reviewBtnRef = useRef<HTMLButtonElement>(null);
  const notice = s.takeoverFailed ? tr("somethingWrong") : null;

  const q = initial.questions[index]!;
  const total = initial.questions.length;
  const answeredCount = initial.questions.filter((x) => answers[x.examQuestionId]).length;
  const unansweredNums = initial.questions.filter((x) => !answers[x.examQuestionId]).map((x) => x.position + 1);
  const readOnly = status === "readonly";
  const locked = readOnly || timeUp || submitState !== "idle";

  // Close the submit dialog when editing becomes impossible (time up / another tab took over).
  useEffect(() => {
    if ((timeUp || readOnly) && dialogRef.current?.open) dialogRef.current.close();
  }, [timeUp, readOnly]);

  const statusText: Record<string, string> = {
    saved: tr("statusSaved"),
    pending: tr("statusPending"),
    saving: tr("statusSaving"),
    retrying: tr("statusRetry"),
    offline: tr("statusOffline"),
    conflict: tr("statusConflict"),
    readonly: tr("readOnlyTitle"),
    finalized: tr("receiptTitle"),
  };
  const statusTone = status === "saved" ? "text-ok" : status === "offline" || status === "retrying" ? "text-danger" : "text-muted";

  const openReview = () => {
    setReviewOpen(true);
    dialogRef.current?.showModal();
  };
  const closeReview = () => {
    setReviewOpen(false);
    dialogRef.current?.close();
    reviewBtnRef.current?.focus();
  };

  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 py-2">
          {initial.exam.teacherPhotoId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/v1/media/${initial.exam.teacherPhotoId}`} alt="" width={36} height={36} className="hidden size-9 rounded-full object-cover sm:block" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{initial.exam.title}</p>
            <p role="status" aria-live="polite" className={cx("text-xs font-semibold", statusTone)}>
              <span aria-hidden>{status === "saved" ? "✓ " : status === "offline" || status === "retrying" ? "⚠ " : "… "}</span>
              {statusText[status]}
            </p>
          </div>
          {initial.deadlineAt && <Countdown deadline={initial.deadlineAt} clock={clock} onExpire={onExpire} tr={tr} />}
        </div>
        <div className="h-1 bg-surface-2" aria-hidden>
          <div className="h-1 bg-brand transition-all" style={{ width: `${(answeredCount / total) * 100}%` }} />
        </div>
      </header>

      <main id="main" className="mx-auto grid max-w-5xl gap-4 px-3 py-4 lg:grid-cols-[1fr_16rem]">
        <div className="space-y-3">
          {readOnly && (
            <Alert kind="warn" title={tr("readOnlyTitle")}>
              <p>{tr("readOnlyBody")}</p>
              <Button className="mt-2" onClick={takeover}>
                {tr("continueHere")}
              </Button>
            </Alert>
          )}
          {timeUp && <Alert kind="info" live title={tr("timeUp")} />}
          {submitState === "retrying" && <Alert kind="warn" live>{tr("submitFailedRetry")}</Alert>}
          {notice && <Alert kind="danger">{notice}</Alert>}

          <article className="rounded-xl border border-border bg-bg p-4 sm:p-6" aria-labelledby="q-title">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="q-title" className="text-sm font-bold text-muted">
                {tr("questionOf", { n: index + 1, total })}
              </h2>
              <span className="text-xs text-muted">{q.marks === 1 ? tr("oneMark") : tr("marksForQuestion", { marks: q.marks })}</span>
            </div>
            <fieldset disabled={locked}>
              <legend className="mb-4 text-lg leading-relaxed">
                <MathText text={q.stem} />
                {q.media && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/v1/media/${q.media.id}`} alt={q.media.alt ?? ""} width={q.media.width} height={q.media.height} className="mt-3 max-h-80 rounded-lg border border-border bg-white object-contain" />
                )}
              </legend>
              <div className="space-y-2.5">
                {q.options.map((o, i) => {
                  const checked = answers[q.examQuestionId] === o.id;
                  return (
                    <label
                      key={o.id}
                      className={cx(
                        "relative flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]",
                        checked ? "border-brand bg-brand-soft" : "border-border bg-bg hover:border-brand",
                      )}
                    >
                      <input
                        type="radio"
                        // Native radio stretched transparently over the whole option: full-size tap target,
                        // native keyboard/AT semantics; the visible letter badge is decorative.
                        className="absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none rounded-xl opacity-0 disabled:cursor-not-allowed"
                        name={`q-${q.examQuestionId}`}
                        value={o.id}
                        checked={checked}
                        onChange={() => s.select(q.examQuestionId, o.id)}
                      />
                      <span aria-hidden className={cx("grid size-8 shrink-0 place-items-center rounded-full border-2 font-bold", checked ? "border-brand bg-brand text-brand-fg" : "border-border")}>
                        {checked ? "✓" : LETTERS[i]}
                      </span>
                      <span className="min-w-0 flex-1 pt-0.5">
                        <span className="sr-only">{LETTERS[i]}. </span>
                        <MathText text={o.text} />
                        {o.media && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/v1/media/${o.media.id}`} alt={o.media.alt ?? ""} width={o.media.width} height={o.media.height} className="mt-2 max-h-48 rounded border border-border bg-white object-contain" />
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" disabled={locked || !answers[q.examQuestionId]} onClick={() => s.select(q.examQuestionId, null)}>
                {tr("clearAnswer")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={flags.has(q.examQuestionId)}
                onClick={() => s.toggleFlag(q.examQuestionId)}
              >
                <span aria-hidden>⚑</span> {flags.has(q.examQuestionId) ? tr("flagged") : tr("flag")}
              </Button>
            </div>
          </article>

          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" size="lg" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
              ← {tr("previous")}
            </Button>
            {index < total - 1 ? (
              <Button variant="secondary" size="lg" onClick={() => setIndex((i) => i + 1)}>
                {tr("next")} →
              </Button>
            ) : (
              <Button ref={reviewBtnRef} size="lg" disabled={readOnly || timeUp} onClick={openReview}>
                {tr("reviewAndSubmit")}
              </Button>
            )}
          </div>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border border-border bg-bg p-3">
            <p className="text-sm">
              {tr("answered", { count: answeredCount })} · {tr("unanswered", { count: total - answeredCount })}
            </p>
            <nav aria-label={tr("questionNav")} className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-5">
              {initial.questions.map((x, i) => {
                const isAns = Boolean(answers[x.examQuestionId]);
                const isFlag = flags.has(x.examQuestionId);
                return (
                  <button
                    key={x.examQuestionId}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-current={i === index ? "step" : undefined}
                    aria-label={`${tr("goToQuestion", { n: i + 1 })}${isAns ? `, ${tr("statusSaved")}` : `, ${tr("notAnswered")}`}${isFlag ? `, ${tr("flagged")}` : ""}`}
                    className={cx(
                      "relative min-h-11 rounded-lg border text-sm font-bold",
                      isAns ? "border-brand bg-brand text-brand-fg" : "border-border bg-bg",
                      i === index && "ring-2 ring-fg ring-offset-1",
                    )}
                  >
                    {i + 1}
                    {isFlag && <span aria-hidden className="absolute -right-1 -top-1 text-xs text-warn">⚑</span>}
                  </button>
                );
              })}
            </nav>
          </div>
          <Button ref={index < total - 1 ? reviewBtnRef : undefined} className="w-full" size="lg" disabled={readOnly || timeUp} onClick={openReview}>
            {tr("reviewAndSubmit")}
          </Button>
        </aside>
      </main>

      <dialog ref={dialogRef} aria-labelledby="submit-title" onClose={() => setReviewOpen(false)} onCancel={(e) => { if (submitState !== "idle") e.preventDefault(); }} className="m-auto w-[min(32rem,92vw)] rounded-xl border border-border bg-bg p-5 text-fg backdrop:bg-black/50">
        {reviewOpen && (
          <div>
            <h2 id="submit-title" className="text-lg font-bold">
              {tr("submitTitle")}
            </h2>
            <p className="mt-2 text-sm">
              {tr("answered", { count: answeredCount })} · {tr("unanswered", { count: total - answeredCount })}
            </p>
            <p className="mt-2 text-sm">{unansweredNums.length ? tr("submitUnansweredList", { list: unansweredNums.join(", ") }) : tr("submitAllAnswered")}</p>
            {flags.size > 0 && (
              <p className="mt-1 text-sm">
                ⚑ {tr("flagged")}: {initial.questions.filter((x) => flags.has(x.examQuestionId)).map((x) => x.position + 1).join(", ")}
              </p>
            )}
            <p className="mt-3 text-sm font-semibold">{tr("submitWarning")}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="secondary" disabled={submitState !== "idle"} onClick={closeReview} autoFocus>
                {tr("keepWorking")}
              </Button>
              <Button disabled={submitState !== "idle"} onClick={submit}>
                {submitState === "idle" ? tr("submitNow") : tr("submitting")}
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}

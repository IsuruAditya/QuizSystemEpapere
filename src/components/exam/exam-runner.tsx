"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AttemptView } from "@/lib/attempt/types";
import type { SyncStatus } from "@/lib/attempt/sync-queue";
import { t, type Lang, type T } from "@/lib/i18n/dictionaries";
import { MathText } from "../math-text";
import { Alert, Button, cx } from "../ui";
import { IconCheck, IconChevronLeft, IconChevronRight, IconClose, IconEraser, IconFlag, IconGrid, IconWifiOff } from "../ui/icons";
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

function SaveStatus({ status, tr }: { status: SyncStatus; tr: T }) {
  const text: Record<SyncStatus, string> = {
    saved: tr("statusSaved"),
    pending: tr("statusPending"),
    saving: tr("statusSaving"),
    retrying: tr("statusRetry"),
    offline: tr("statusOffline"),
    conflict: tr("statusConflict"),
    readonly: tr("readOnlyTitle"),
    finalized: tr("receiptTitle"),
  };
  const bad = status === "offline" || status === "retrying";
  return (
    <p role="status" aria-live="polite" className={cx("flex items-center gap-1 text-xs font-semibold", status === "saved" ? "text-ok" : bad ? "text-danger" : "text-muted")}>
      {status === "saved" ? <IconCheck size={14} /> : bad ? <IconWifiOff size={14} /> : <span aria-hidden className="size-2 animate-pulse rounded-full bg-current" />}
      <span className="truncate">{text[status]}</span>
    </p>
  );
}

/** Question number grid (shared by the desktop side panel and the phone drawer). */
function QuestionGrid({ view, answers, flags, index, onPick, tr }: { view: AttemptView; answers: Record<string, string | null>; flags: ReadonlySet<string>; index: number; onPick: (i: number) => void; tr: T }) {
  return (
    <nav aria-label={tr("questionNav")} className="grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-5">
      {view.questions.map((x, i) => {
        const isAns = Boolean(answers[x.examQuestionId]);
        const isFlag = flags.has(x.examQuestionId);
        return (
          <button
            key={x.examQuestionId}
            type="button"
            onClick={() => onPick(i)}
            aria-current={i === index ? "step" : undefined}
            aria-label={`${tr("goToQuestion", { n: i + 1 })}${isAns ? `, ${tr("statusSaved")}` : `, ${tr("notAnswered")}`}${isFlag ? `, ${tr("flagged")}` : ""}`}
            className={cx(
              "relative min-h-11 rounded-xl border text-sm font-bold transition-colors",
              isAns ? "border-brand bg-brand text-brand-fg" : "border-border-strong bg-bg hover:bg-surface",
              i === index && "ring-2 ring-fg ring-offset-2 ring-offset-bg",
            )}
          >
            {i + 1}
            {isFlag && (
              <span aria-hidden className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-warn text-bg">
                <IconFlag size={11} />
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

/** Presentation only; behaviour lives in useExamSession. */
function Runner({ initial, userId, lang }: { initial: AttemptView; userId: string; lang: Lang }) {
  const tr = useMemo(() => t(lang), [lang]);
  const s = useExamSession(initial, userId, tr("leaveWarning"));
  const { answers, status, flags, clock, timeUp, submitState, onExpire, takeover, submit } = s;
  const [index, setIndex] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const gridRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const notice = s.takeoverFailed ? tr("somethingWrong") : null;

  const q = initial.questions[index]!;
  const total = initial.questions.length;
  const isLast = index === total - 1;
  const answeredCount = initial.questions.filter((x) => answers[x.examQuestionId]).length;
  const unansweredNums = initial.questions.filter((x) => !answers[x.examQuestionId]).map((x) => x.position + 1);
  const readOnly = status === "readonly";
  const locked = readOnly || timeUp || submitState !== "idle";

  // Close dialogs when editing becomes impossible (time up / another tab took over).
  useEffect(() => {
    if ((timeUp || readOnly) && dialogRef.current?.open) dialogRef.current.close();
  }, [timeUp, readOnly]);

  const go = (i: number) => {
    setIndex(i);
    gridRef.current?.close();
    // Move focus and scroll to the new question so keyboard and screen-reader users follow along.
    requestAnimationFrame(() => {
      questionRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const openReview = (e: React.MouseEvent<HTMLElement>) => {
    triggerRef.current = e.currentTarget;
    setReviewOpen(true);
    dialogRef.current?.showModal();
  };
  const closeReview = () => {
    setReviewOpen(false);
    dialogRef.current?.close();
    triggerRef.current?.focus();
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-3 sm:px-5">
          {initial.exam.teacherPhotoId && (
            // eslint-disable-next-line @next/next/no-img-element -- authorised media route
            <img src={`/api/v1/media/${initial.exam.teacherPhotoId}`} alt="" width={36} height={36} className="hidden size-9 rounded-full object-cover sm:block" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{initial.exam.title}</p>
            <SaveStatus status={status} tr={tr} />
          </div>
          {initial.deadlineAt && (
            <div className="rounded-xl bg-surface px-3 py-1">
              <Countdown deadline={initial.deadlineAt} clock={clock} onExpire={onExpire} tr={tr} />
            </div>
          )}
        </div>
        <div className="h-1 bg-surface-2" aria-hidden>
          <div className="h-1 bg-brand transition-all duration-300" style={{ width: `${(answeredCount / total) * 100}%` }} />
        </div>
      </header>

      <main id="main" className="mx-auto grid max-w-6xl gap-5 px-3 pb-28 pt-4 sm:px-5 lg:grid-cols-[1fr_18rem] lg:pb-10">
        <div className="min-w-0 space-y-3">
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

          <article className="rounded-3xl border border-border bg-bg p-4 shadow-card sm:p-7" aria-labelledby="q-title">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 id="q-title" ref={questionRef} tabIndex={-1} className="rounded-full bg-brand-soft px-3 py-1 text-sm font-bold text-brand outline-offset-4">
                {tr("questionOf", { n: index + 1, total })}
              </h2>
              <span className="text-xs font-semibold text-muted">{q.marks === 1 ? tr("oneMark") : tr("marksForQuestion", { marks: q.marks })}</span>
            </div>
            <fieldset disabled={locked}>
              <legend className="mb-5 text-lg leading-relaxed sm:text-xl">
                <MathText text={q.stem} />
                {q.media && (
                  // eslint-disable-next-line @next/next/no-img-element -- authorised media route
                  <img src={`/api/v1/media/${q.media.id}`} alt={q.media.alt ?? ""} width={q.media.width} height={q.media.height} className="mt-3 max-h-80 rounded-2xl border border-border bg-white object-contain" />
                )}
              </legend>
              <div className="space-y-3">
                {q.options.map((o, i) => {
                  const checked = answers[q.examQuestionId] === o.id;
                  return (
                    <label
                      key={o.id}
                      className={cx(
                        "relative flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border-2 p-3.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] has-[:disabled]:cursor-not-allowed",
                        checked ? "border-brand bg-brand-soft" : "border-border-strong bg-bg hover:border-brand hover:bg-surface",
                      )}
                    >
                      <input
                        type="radio"
                        // Native radio stretched transparently over the whole option: full-size tap target,
                        // native keyboard/AT semantics; the visible letter badge is decorative.
                        className="absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none rounded-2xl opacity-0 disabled:cursor-not-allowed"
                        name={`q-${q.examQuestionId}`}
                        value={o.id}
                        checked={checked}
                        onChange={() => s.select(q.examQuestionId, o.id)}
                      />
                      <span aria-hidden className={cx("grid size-9 shrink-0 place-items-center rounded-full border-2 font-bold transition-colors", checked ? "border-brand bg-brand text-brand-fg" : "border-border-strong text-muted")}>
                        {checked ? <IconCheck size={18} /> : LETTERS[i]}
                      </span>
                      <span className="min-w-0 flex-1 pt-1">
                        <span className="sr-only">{LETTERS[i]}. </span>
                        <MathText text={o.text} />
                        {o.media && (
                          // eslint-disable-next-line @next/next/no-img-element -- authorised media route
                          <img src={`/api/v1/media/${o.media.id}`} alt={o.media.alt ?? ""} width={o.media.width} height={o.media.height} className="mt-2 max-h-48 rounded-xl border border-border bg-white object-contain" />
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4" role="group" aria-label={tr("examTools")}>
              <Button variant="ghost" size="sm" disabled={locked || !answers[q.examQuestionId]} onClick={() => s.select(q.examQuestionId, null)}>
                <IconEraser size={16} /> {tr("clearAnswer")}
              </Button>
              <Button variant={flags.has(q.examQuestionId) ? "soft" : "ghost"} size="sm" aria-pressed={flags.has(q.examQuestionId)} onClick={() => s.toggleFlag(q.examQuestionId)}>
                <IconFlag size={16} /> {flags.has(q.examQuestionId) ? tr("flagged") : tr("flag")}
              </Button>
            </div>
          </article>

          {/* Question navigation: fixed to the bottom on phones (thumb reach), inline on large screens. */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 lg:px-0 lg:py-0">
              <Button variant="secondary" size="lg" className="px-3 sm:px-5" disabled={index === 0} onClick={() => go(index - 1)} aria-label={tr("previous")}>
                <IconChevronLeft />
                <span className="hidden sm:inline">{tr("previous")}</span>
              </Button>
              <button
                type="button"
                onClick={() => gridRef.current?.showModal()}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-border-strong bg-bg text-sm font-semibold hover:bg-surface lg:hidden"
                aria-haspopup="dialog"
              >
                <IconGrid size={18} />
                {index + 1} / {total}
                <span className="sr-only">{tr("questionsPanel")}</span>
              </button>
              <span className="hidden flex-1 lg:block" />
              {isLast ? (
                <Button size="lg" disabled={readOnly || timeUp} onClick={openReview}>
                  {tr("reviewAndSubmit")}
                </Button>
              ) : (
                <Button variant="primary" size="lg" className="px-3 sm:px-5" onClick={() => go(index + 1)} aria-label={tr("next")}>
                  <span className="hidden sm:inline">{tr("next")}</span>
                  <IconChevronRight />
                </Button>
              )}
            </div>
          </div>
        </div>

        <aside className="hidden space-y-3 lg:sticky lg:top-24 lg:block lg:self-start">
          <div className="rounded-3xl border border-border bg-bg p-4 shadow-card">
            <p className="mb-3 text-sm text-muted">
              {tr("answered", { count: answeredCount })} · {tr("unanswered", { count: total - answeredCount })}
            </p>
            <QuestionGrid view={initial} answers={answers} flags={flags} index={index} onPick={go} tr={tr} />
          </div>
          <Button className="w-full" size="lg" disabled={readOnly || timeUp} onClick={openReview}>
            {tr("reviewAndSubmit")}
          </Button>
        </aside>
      </main>

      {/* Phone question drawer */}
      <dialog ref={gridRef} aria-labelledby="grid-title" className="mb-0 mt-auto w-full max-w-none rounded-t-3xl border border-border bg-bg p-0 text-fg sm:m-auto sm:w-[min(36rem,92vw)] sm:rounded-3xl">
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="grid-title" className="text-lg font-bold">
              {tr("questionsPanel")}
            </h2>
            <button type="button" onClick={() => gridRef.current?.close()} className="grid min-h-11 min-w-11 place-items-center rounded-xl hover:bg-surface" aria-label={tr("close")}>
              <IconClose />
            </button>
          </div>
          <p className="mb-4 text-sm text-muted">
            {tr("answered", { count: answeredCount })} · {tr("unanswered", { count: total - answeredCount })}
          </p>
          <QuestionGrid view={initial} answers={answers} flags={flags} index={index} onPick={go} tr={tr} />
          <Button
            className="mt-5 w-full"
            size="lg"
            disabled={readOnly || timeUp}
            onClick={(e) => {
              gridRef.current?.close();
              openReview(e);
            }}
          >
            {tr("reviewAndSubmit")}
          </Button>
        </div>
      </dialog>

      <dialog
        ref={dialogRef}
        aria-labelledby="submit-title"
        onClose={() => setReviewOpen(false)}
        onCancel={(e) => {
          if (submitState !== "idle") e.preventDefault();
        }}
        className="m-auto w-[min(32rem,92vw)] rounded-3xl border border-border bg-bg p-6 text-fg shadow-card"
      >
        {reviewOpen && (
          <div>
            <h2 id="submit-title" className="text-xl font-bold">
              {tr("submitTitle")}
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-ok-soft p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{answeredCount}</p>
                <p className="text-xs font-semibold">{tr("answeredLabel")}</p>
              </div>
              <div className={cx("rounded-2xl p-3 text-center", unansweredNums.length ? "bg-warn-soft" : "bg-surface")}>
                <p className="text-2xl font-bold tabular-nums">{total - answeredCount}</p>
                <p className="text-xs font-semibold">{tr("unansweredLabel")}</p>
              </div>
            </div>
            <p className="mt-4 text-sm">{unansweredNums.length ? tr("submitUnansweredList", { list: unansweredNums.join(", ") }) : tr("submitAllAnswered")}</p>
            {flags.size > 0 && (
              <p className="mt-1 flex items-center gap-1.5 text-sm">
                <IconFlag size={14} /> {tr("flagged")}: {initial.questions.filter((x) => flags.has(x.examQuestionId)).map((x) => x.position + 1).join(", ")}
              </p>
            )}
            <p className="mt-4 rounded-xl bg-surface p-3 text-sm font-semibold">{tr("submitWarning")}</p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" size="lg" disabled={submitState !== "idle"} onClick={closeReview} autoFocus>
                {tr("keepWorking")}
              </Button>
              <Button size="lg" disabled={submitState !== "idle"} onClick={submit}>
                {submitState === "idle" ? tr("submitNow") : tr("submitting")}
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}

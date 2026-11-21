"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { attemptApi, conflictState, sendBatch } from "@/lib/api/student";
import { toApiError } from "@/lib/api-client";
import { createBrowserDeps, createServerClock, readSession, type ServerClock } from "@/lib/attempt/browser";
import { loadLocal, storageKey, SyncQueue, type AnswerMap, type SyncStatus } from "@/lib/attempt/sync-queue";
import type { AttemptView } from "@/lib/attempt/types";

export type SubmitState = "idle" | "submitting" | "retrying";

export interface ExamSession {
  answers: AnswerMap;
  status: SyncStatus;
  select: (examQuestionId: string, optionId: string | null) => void;
  flags: ReadonlySet<string>;
  toggleFlag: (examQuestionId: string) => void;
  clock: ServerClock;
  timeUp: boolean;
  onExpire: () => Promise<void>;
  submitState: SubmitState;
  submit: () => Promise<void>;
  takeover: () => Promise<void>;
  /** Set when a takeover failed for a reason other than the attempt being finished. */
  takeoverFailed: boolean;
}

const ctlKey = (attemptId: string) => `ep:ctl:${attemptId}`;
const flagsKey = (attemptId: string) => `ep:flags:${attemptId}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readFlags(attemptId: string): Set<string> {
  try {
    const v: unknown = JSON.parse(readSession(flagsKey(attemptId)) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/**
 * All client-side attempt behaviour (ADR-004): answer sync queue, server-clock resync on wake/reconnect,
 * expiry handling, controller takeover, and the submit protocol. The runner component only renders.
 */
export function useExamSession(initial: AttemptView, userId: string, leaveWarning: string): ExamSession {
  const router = useRouter();
  const attemptId = initial.id;
  const [clock] = useState(() => createServerClock(initial.serverTime));
  const [queue] = useState(
    () => new SyncQueue(attemptId, readSession(ctlKey(attemptId)), initial.revision, initial.answers, createBrowserDeps(userId, attemptId, sendBatch), loadLocal(localStorage, userId, attemptId)),
  );
  const [flags, setFlags] = useState<Set<string>>(() => readFlags(attemptId));
  const [timeUp, setTimeUp] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [takeoverFailed, setTakeoverFailed] = useState(false);

  useSyncExternalStore(
    useCallback((cb: () => void) => queue.subscribe(cb), [queue]),
    () => `${queue.status}|${queue.revision}|${JSON.stringify(queue.view())}`,
    () => "",
  );

  const goResult = useCallback(() => {
    try {
      localStorage.removeItem(storageKey(userId, attemptId));
      sessionStorage.removeItem(ctlKey(attemptId));
      sessionStorage.removeItem(flagsKey(attemptId));
    } catch {
      /* storage unavailable */
    }
    router.replace(`/attempts/${attemptId}/result`);
  }, [router, userId, attemptId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(flagsKey(attemptId), JSON.stringify([...flags]));
    } catch {
      /* storage unavailable */
    }
  }, [flags, attemptId]);

  useEffect(() => {
    if (queue.status === "finalized") goResult();
  });

  // Timers may be throttled while hidden or asleep: resync the clock and state on wake/reconnect.
  const resync = useCallback(async () => {
    try {
      const v = await attemptApi.get(attemptId);
      clock.sync(v.serverTime);
      if (v.status !== "IN_PROGRESS") return queue.markFinalized();
    } catch {
      /* offline: keep the local estimate */
    }
    queue.nudge();
  }, [attemptId, clock, queue]);

  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && void resync();
    const onOnline = () => void resync();
    const onBefore = (e: BeforeUnloadEvent) => {
      if (!queue.hasUnsaved()) return;
      e.preventDefault();
      e.returnValue = leaveWarning;
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBefore);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBefore);
    };
  }, [resync, queue, leaveWarning]);

  const onExpire = useCallback(async () => {
    setTimeUp(true);
    // Try to land the last pending answers; the server admits them only before its own deadline.
    await queue.flush().catch(() => undefined);
    for (let i = 0; i < 6; i++) {
      try {
        const v = await attemptApi.get(attemptId);
        if (v.status !== "IN_PROGRESS") return goResult();
        clock.sync(v.serverTime);
      } catch {
        /* retry */
      }
      await sleep(1500 + Math.random() * 1500);
    }
    goResult();
  }, [queue, attemptId, goResult, clock]);

  const takeover = useCallback(async () => {
    setTakeoverFailed(false);
    try {
      const r = await attemptApi.takeover(attemptId);
      sessionStorage.setItem(ctlKey(attemptId), r.controllerToken);
      queue.becomeController(r.controllerToken, r.revision, r.answers);
    } catch (e) {
      if (toApiError(e).code === "ATTEMPT_FINALIZED") goResult();
      else setTakeoverFailed(true);
    }
  }, [attemptId, queue, goResult]);

  const submit = useCallback(async () => {
    setSubmitState("submitting");
    const mutationId = crypto.randomUUID();
    for (let n = 1; ; n++) {
      const snap = await queue.drainForSubmit();
      if (!snap.token) return setSubmitState("idle");
      try {
        await attemptApi.submit(attemptId, { mutationId, baseRevision: snap.baseRevision, controllerToken: snap.token, finalChanges: snap.finalChanges });
        queue.markFinalized();
        return goResult();
      } catch (e) {
        const a = toApiError(e);
        if (a.code === "REVISION_CONFLICT") {
          const c = conflictState(a);
          queue.adoptServer(c.revision, c.answers);
          continue;
        }
        if (a.code === "CONTROLLER_CHANGED") {
          setSubmitState("idle");
          return queue.markReadOnly();
        }
        if (a.code === "ATTEMPT_FINALIZED" || a.code === "NOT_FOUND") return goResult();
        // Unknown outcome (network/5xx): retry the same submit; the server returns the canonical receipt.
        setSubmitState("retrying");
        await sleep(Math.min(15_000, 1000 * 2 ** n) * (0.7 + Math.random() * 0.6));
      }
    }
  }, [attemptId, queue, goResult]);

  const toggleFlag = useCallback((id: string) => {
    setFlags((f) => {
      const n = new Set(f);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  return {
    answers: queue.view(),
    status: queue.status,
    select: (q, o) => queue.select(q, o),
    flags,
    toggleFlag,
    clock,
    timeUp,
    onExpire,
    submitState,
    submit,
    takeover,
    takeoverFailed,
  };
}

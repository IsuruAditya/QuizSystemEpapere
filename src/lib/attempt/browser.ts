"use client";
import { storageKey, type Deps, type PersistedState } from "./sync-queue";

/** Browser implementations of the sync-queue dependencies (timers, ids, scoped local persistence). */
export function createBrowserDeps(userId: string, attemptId: string, send: Deps["send"]): Deps {
  return {
    send,
    newId: () => crypto.randomUUID(),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (h) => window.clearTimeout(h as number),
    now: () => Date.now(),
    random: () => Math.random(),
    persist: (s: PersistedState | null) => {
      try {
        if (s) localStorage.setItem(storageKey(userId, attemptId), JSON.stringify(s));
        else localStorage.removeItem(storageKey(userId, attemptId));
      } catch {
        /* storage full/blocked: the server copy remains authoritative */
      }
    },
  };
}

/** Presentation-only server clock anchored to the monotonic performance clock. */
export function createServerClock(serverTimeIso: string) {
  let base = Date.parse(serverTimeIso);
  let perf = performance.now();
  return {
    now: () => base + (performance.now() - perf),
    sync: (iso: string) => {
      base = Date.parse(iso);
      perf = performance.now();
    },
  };
}
export type ServerClock = ReturnType<typeof createServerClock>;

export function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

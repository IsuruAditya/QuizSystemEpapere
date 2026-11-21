/**
 * Pure timing rules (ADR-003). All instants are server-assigned; nothing here reads a client clock.
 */

export type Availability = "UPCOMING" | "OPEN" | "CLOSED";

export interface ExamWindow {
  opensAt: Date | null;
  closesAt: Date | null;
}

export function availability(w: ExamWindow, now: Date): Availability {
  if (w.opensAt && now < w.opensAt) return "UPCOMING";
  if (w.closesAt && now >= w.closesAt) return "CLOSED";
  return "OPEN";
}

/** deadline = min(startedAt + duration, closesAt); null only for untimed attempts with no close time. */
export function computeDeadline(startedAt: Date, durationSeconds: number | null, closesAt: Date | null): Date | null {
  const byDuration = durationSeconds === null ? null : new Date(startedAt.getTime() + durationSeconds * 1000);
  if (byDuration && closesAt) return byDuration < closesAt ? byDuration : closesAt;
  return byDuration ?? closesAt;
}

/** Seconds a late starter would get, for the pre-start warning; null = untimed. */
export function remainingIfStartedAt(now: Date, durationSeconds: number | null, closesAt: Date | null): number | null {
  const d = computeDeadline(now, durationSeconds, closesAt);
  return d ? Math.max(0, Math.floor((d.getTime() - now.getTime()) / 1000)) : null;
}

export function isLateStart(now: Date, durationSeconds: number | null, closesAt: Date | null): boolean {
  if (durationSeconds === null || !closesAt) return false;
  return now.getTime() + durationSeconds * 1000 > closesAt.getTime();
}

/** Admission rule: a mutation is admitted iff receivedAt < deadline (strict). */
export function isAdmitted(receivedAt: Date, deadline: Date | null): boolean {
  return deadline === null || receivedAt.getTime() < deadline.getTime();
}

/**
 * Elapsed time for ranking.
 * - MANUAL: receipt − start, bounded by the deadline.
 * - EXPIRED: deadline − start, independent of when reconciliation ran.
 */
export function elapsedMs(reason: "MANUAL" | "EXPIRED", startedAt: Date, receiptAt: Date, deadline: Date | null): number {
  const end =
    reason === "EXPIRED"
      ? (deadline ?? receiptAt)
      : deadline && receiptAt > deadline
        ? deadline
        : receiptAt;
  return Math.max(0, end.getTime() - startedAt.getTime());
}

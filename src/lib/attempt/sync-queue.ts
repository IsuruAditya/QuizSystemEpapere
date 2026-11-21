/**
 * Client answer-sync engine (ADR-004). Framework-free so it can be unit tested.
 *
 * Contract:
 * - Selections update local state immediately; changes are batched (debounce 800 ms, max wait 4 s).
 * - At most ONE batch in flight. A transiently failed batch is retried unchanged (same mutationId),
 *   so a committed-but-unacknowledged save is recognised as a duplicate, never re-applied out of order.
 * - "saved" is shown only after the server acknowledges the revision.
 * - REVISION_CONFLICT: adopt server state, re-queue unresolved local selections (kept visible).
 * - CONTROLLER_CHANGED: become read-only; local selections are preserved for takeover.
 * - ATTEMPT_FINALIZED: stop; caller navigates to the result.
 */
export type AnswerMap = Record<string, string | null>;
export type SyncStatus = "saved" | "pending" | "saving" | "retrying" | "offline" | "conflict" | "readonly" | "finalized";

export interface Change {
  examQuestionId: string;
  optionId: string | null;
}
export interface Batch {
  mutationId: string;
  baseRevision: number;
  changes: Change[];
}

export type TransportResult =
  | { ok: true; revision: number; serverTime?: string }
  | { ok: false; kind: "conflict"; revision: number; answers: AnswerMap }
  | { ok: false; kind: "controller" | "finalized" | "permanent" }
  | { ok: false; kind: "transient"; retryAfterSeconds?: number | null; offline?: boolean };

/** Small, separately substitutable dependencies (interface segregation; see tests/unit/sync-queue.test.ts). */
export interface Transport {
  send(attemptId: string, token: string, batch: Batch): Promise<TransportResult>;
}
export interface Scheduler {
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(h: unknown): void;
}
export interface Clock {
  now(): number;
}
export interface Entropy {
  newId(): string;
  random(): number;
}
export interface LocalPersistence {
  persist?(state: PersistedState | null): void;
}
export type Deps = Transport & Scheduler & Clock & Entropy & LocalPersistence;

export interface PersistedState {
  pending: AnswerMap;
  inflight: Batch | null;
}

export const DEBOUNCE_MS = 800;
export const MAX_WAIT_MS = 4000;

export function backoffMs(failures: number, random: number, retryAfterSeconds?: number | null): number {
  const base = Math.min(30_000, 1000 * 2 ** Math.max(0, failures - 1));
  const jittered = base * (0.7 + 0.6 * random);
  return Math.max(jittered, (retryAfterSeconds ?? 0) * 1000);
}

export class SyncQueue {
  private confirmed: AnswerMap;
  private pending = new Map<string, string | null>();
  private inflight: Batch | null = null;
  private timer: unknown = null;
  private firstPendingAt: number | null = null;
  private failures = 0;
  private listeners = new Set<() => void>();
  private flushWaiters: (() => void)[] = [];
  status: SyncStatus = "saved";
  lastSavedAt: number | null = null;

  constructor(
    private attemptId: string,
    private token: string | null,
    public revision: number,
    serverAnswers: AnswerMap,
    private deps: Deps,
    restored?: PersistedState | null,
  ) {
    this.confirmed = { ...serverAnswers };
    if (!token) this.status = "readonly";
    if (restored) {
      // Recovered unsaved work from this device (same user + attempt). A restored in-flight batch
      // is retried with its original mutationId first, so it can't be applied twice.
      if (restored.inflight) for (const c of restored.inflight.changes) if (!(c.examQuestionId in restored.pending)) this.pending.set(c.examQuestionId, c.optionId);
      for (const [k, v] of Object.entries(restored.pending)) this.pending.set(k, v);
      if (this.pending.size && this.token) {
        this.status = "pending";
        this.firstPendingAt = deps.now();
        this.schedule(0);
      }
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  /** What the UI shows: confirmed answers overlaid with in-flight and pending local selections. */
  view(): AnswerMap {
    const v: AnswerMap = { ...this.confirmed };
    if (this.inflight) for (const c of this.inflight.changes) v[c.examQuestionId] = c.optionId;
    for (const [k, o] of this.pending) v[k] = o;
    return v;
  }
  hasUnsaved(): boolean {
    return this.pending.size > 0 || this.inflight !== null;
  }
  isReadOnly(): boolean {
    return this.status === "readonly" || this.status === "finalized";
  }

  select(examQuestionId: string, optionId: string | null) {
    if (this.isReadOnly()) return;
    this.pending.set(examQuestionId, optionId);
    this.firstPendingAt ??= this.deps.now();
    if (!this.inflight && this.status !== "retrying" && this.status !== "offline") this.status = "pending";
    this.save();
    const waited = this.deps.now() - this.firstPendingAt;
    this.schedule(Math.max(0, Math.min(DEBOUNCE_MS, MAX_WAIT_MS - waited)));
    this.emit();
  }

  private save() {
    this.deps.persist?.(this.pending.size || this.inflight ? { pending: Object.fromEntries(this.pending), inflight: this.inflight } : null);
  }

  private schedule(ms: number) {
    if (this.timer !== null) this.deps.clearTimer(this.timer);
    this.timer = this.deps.setTimer(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  /** Send the next batch now (no-op when one is in flight or nothing is pending). */
  async flush(): Promise<void> {
    if (this.inflight || this.isReadOnly() || !this.token) return;
    if (this.pending.size === 0) {
      this.resolveWaiters();
      return;
    }
    this.inflight = {
      mutationId: this.deps.newId(),
      baseRevision: this.revision,
      changes: [...this.pending].map(([examQuestionId, optionId]) => ({ examQuestionId, optionId })),
    };
    this.pending.clear();
    this.firstPendingAt = null;
    await this.sendInflight();
  }

  private async sendInflight(): Promise<void> {
    const batch = this.inflight!;
    if (this.status !== "retrying" && this.status !== "offline") this.status = "saving";
    this.save();
    this.emit();
    let r: TransportResult;
    try {
      r = await this.deps.send(this.attemptId, this.token!, batch);
    } catch {
      r = { ok: false, kind: "transient" };
    }
    if (r.ok) {
      this.failures = 0;
      this.revision = r.revision;
      for (const c of batch.changes) this.confirmed[c.examQuestionId] = c.optionId;
      this.inflight = null;
      this.lastSavedAt = this.deps.now();
      this.status = this.pending.size ? "pending" : "saved";
      this.save();
      this.emit();
      if (this.pending.size) this.schedule(0);
      else this.resolveWaiters();
      return;
    }
    switch (r.kind) {
      case "conflict": {
        this.failures = 0;
        this.confirmed = { ...r.answers };
        this.revision = r.revision;
        // Re-queue our unresolved selections (older batch first, newer pending wins).
        const merged = new Map<string, string | null>(batch.changes.map((c) => [c.examQuestionId, c.optionId]));
        for (const [k, v] of this.pending) merged.set(k, v);
        this.pending = new Map([...merged].filter(([k, v]) => this.confirmed[k] !== v));
        this.inflight = null;
        this.status = this.pending.size ? "conflict" : "saved";
        this.save();
        this.emit();
        if (this.pending.size) this.schedule(0);
        else this.resolveWaiters();
        return;
      }
      case "controller":
        this.restoreBatch(batch);
        this.status = "readonly";
        this.save();
        this.emit();
        this.resolveWaiters();
        return;
      case "finalized":
        this.inflight = null;
        this.pending.clear();
        this.status = "finalized";
        this.deps.persist?.(null);
        this.emit();
        this.resolveWaiters();
        return;
      case "permanent":
        // Server rejected the content (should not happen for UI-generated IDs): drop it, keep going.
        this.inflight = null;
        this.status = this.pending.size ? "pending" : "saved";
        this.save();
        this.emit();
        if (this.pending.size) this.schedule(0);
        else this.resolveWaiters();
        return;
      case "transient": {
        this.failures++;
        this.status = r.offline ? "offline" : "retrying";
        this.emit();
        const wait = backoffMs(this.failures, this.deps.random(), r.retryAfterSeconds);
        this.deps.setTimer(() => void this.sendInflight(), wait);
        return;
      }
    }
  }

  private restoreBatch(batch: Batch) {
    for (const c of batch.changes) if (!this.pending.has(c.examQuestionId)) this.pending.set(c.examQuestionId, c.optionId);
    this.inflight = null;
  }

  /** Called after a successful takeover. */
  becomeController(token: string, revision: number, serverAnswers: AnswerMap) {
    this.token = token;
    this.revision = revision;
    this.confirmed = { ...serverAnswers };
    for (const [k, v] of [...this.pending]) if (this.confirmed[k] === v) this.pending.delete(k);
    this.status = this.pending.size ? "pending" : "saved";
    this.emit();
    if (this.pending.size) this.schedule(0);
  }

  /** Retry immediately (e.g. browser came back online). */
  nudge() {
    if (this.inflight && (this.status === "retrying" || this.status === "offline")) void this.sendInflight();
    else if (this.pending.size) this.schedule(0);
  }

  /**
   * Prepare for submit: stop scheduling, let any in-flight batch settle, and return the
   * remaining pending changes + base revision to send WITH the submit (final snapshot).
   */
  async drainForSubmit(timeoutMs = 8000): Promise<{ baseRevision: number; finalChanges: Change[]; token: string | null }> {
    if (this.timer !== null) {
      this.deps.clearTimer(this.timer);
      this.timer = null;
    }
    if (this.inflight && this.status !== "retrying" && this.status !== "offline") {
      await new Promise<void>((resolve) => {
        const h = this.deps.setTimer(resolve, timeoutMs);
        this.flushWaiters.push(() => {
          this.deps.clearTimer(h);
          resolve();
        });
      });
    }
    // A batch stuck in retry joins the final snapshot (submit carries it; same values).
    const all = new Map<string, string | null>();
    if (this.inflight) for (const c of this.inflight.changes) all.set(c.examQuestionId, c.optionId);
    for (const [k, v] of this.pending) all.set(k, v);
    return { baseRevision: this.revision, finalChanges: [...all].map(([examQuestionId, optionId]) => ({ examQuestionId, optionId })), token: this.token };
  }

  /** After submit conflict: adopt server state but keep local selections for the next submit. */
  adoptServer(revision: number, answers: AnswerMap) {
    const local = this.view();
    this.confirmed = { ...answers };
    this.revision = revision;
    this.inflight = null;
    this.pending = new Map(Object.entries(local).filter(([k, v]) => this.confirmed[k] !== v));
  }

  /** Another tab/device took over (seen on submit): keep local selections, stop writing. */
  markReadOnly() {
    if (this.timer !== null) this.deps.clearTimer(this.timer);
    this.timer = null;
    if (this.inflight) this.restoreBatch(this.inflight);
    this.status = "readonly";
    this.save();
    this.emit();
  }

  markFinalized() {
    if (this.timer !== null) this.deps.clearTimer(this.timer);
    this.status = "finalized";
    this.pending.clear();
    this.inflight = null;
    this.deps.persist?.(null);
    this.emit();
  }

  private resolveWaiters() {
    const w = this.flushWaiters;
    this.flushWaiters = [];
    for (const f of w) f();
  }
}

/* ───────────── shared-device local storage (scoped to user + attempt) ───────────── */

/** Runtime shape check for data read back from localStorage (it may be stale or tampered with). */
function isPersistedState(v: unknown): v is PersistedState {
  if (typeof v !== "object" || v === null || !("pending" in v)) return false;
  const p = (v as { pending: unknown }).pending;
  if (typeof p !== "object" || p === null) return false;
  if (!Object.values(p).every((o) => o === null || typeof o === "string")) return false;
  const inflight = (v as { inflight?: unknown }).inflight;
  if (inflight === null || inflight === undefined) return true;
  const b = inflight as Partial<Batch>;
  return typeof b.mutationId === "string" && typeof b.baseRevision === "number" && Array.isArray(b.changes);
}

export const storageKey = (userId: string, attemptId: string) => `ep:pending:${userId}:${attemptId}`;

/** Remove other users' recovery data (shared devices) and return this user's state for the attempt. */
export function loadLocal(storage: Pick<Storage, "getItem" | "removeItem" | "key" | "length">, userId: string, attemptId: string): PersistedState | null {
  const mine = `ep:pending:${userId}:`;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k) keys.push(k);
  }
  for (const k of keys) if (k.startsWith("ep:pending:") && !k.startsWith(mine)) storage.removeItem(k);
  const raw = storage.getItem(storageKey(userId, attemptId));
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return isPersistedState(v) ? v : null;
  } catch {
    return null;
  }
}

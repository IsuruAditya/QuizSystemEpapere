import { describe, expect, it } from "vitest";
import { backoffMs, loadLocal, storageKey, SyncQueue, type Batch, type Deps, type TransportResult } from "@/lib/attempt/sync-queue";

/** Deterministic fake clock + manual timers. */
function harness(responses: ((b: Batch) => TransportResult | Promise<TransportResult>)[]) {
  let now = 0;
  let id = 0;
  const timers: { at: number; fn: () => void; h: number }[] = [];
  const sent: Batch[] = [];
  let persisted: unknown = undefined;
  const deps: Deps = {
    send: async (_a, _t, b) => {
      sent.push(structuredClone(b));
      const r = responses.shift();
      if (!r) throw new Error("no response scripted");
      return r(b);
    },
    newId: () => `m${++id}`,
    setTimer: (fn, ms) => {
      const h = Math.random();
      timers.push({ at: now + ms, fn, h });
      return h;
    },
    clearTimer: (h) => {
      const i = timers.findIndex((t) => t.h === h);
      if (i >= 0) timers.splice(i, 1);
    },
    now: () => now,
    random: () => 0.5,
    persist: (s) => {
      persisted = s;
    },
  };
  const advance = async (ms: number) => {
    await new Promise((r) => setTimeout(r, 0)); // let pending promise continuations schedule timers
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift();
      now = t.at;
      t.fn();
      await new Promise((r) => setTimeout(r, 0));
    }
    now = end;
    await new Promise((r) => setTimeout(r, 0));
  };
  return { deps, sent, advance, persisted: () => persisted };
}

const ok = (revision: number) => () => ({ ok: true as const, revision });

describe("SyncQueue (§19.10–§19.12)", () => {
  it("debounces bursts into one batch and shows Saved only after acknowledgement", async () => {
    const h = harness([ok(1)]);
    const q = new SyncQueue("a", "tok", 0, {}, h.deps);
    q.select("q1", "o1");
    await h.advance(300);
    q.select("q1", "o2");
    q.select("q2", "o3");
    expect(q.status).toBe("pending");
    await h.advance(799);
    expect(h.sent.length).toBe(0);
    await h.advance(2);
    expect(h.sent).toEqual([{ mutationId: "m1", baseRevision: 0, changes: [{ examQuestionId: "q1", optionId: "o2" }, { examQuestionId: "q2", optionId: "o3" }] }]);
    expect(q.status).toBe("saved");
    expect(q.revision).toBe(1);
    expect(h.persisted()).toBeNull();
  });

  it("max wait bounds continuous clicking to 4 s", async () => {
    const h = harness([ok(1)]);
    const q = new SyncQueue("a", "tok", 0, {}, h.deps);
    for (let i = 0; i < 12; i++) {
      q.select("q1", `o${i % 4}`);
      await h.advance(400);
    }
    expect(h.sent.length).toBe(1);
    expect(h.sent[0]!.changes[0]!.optionId).toBe("o1"); // value at t≈4 s
  });

  it("only one batch in flight; later selections go in the next batch with the new revision", async () => {
    let release!: (r: TransportResult) => void;
    const h = harness([() => new Promise<TransportResult>((r) => (release = r)), ok(2)]);
    const q = new SyncQueue("a", "tok", 0, {}, h.deps);
    q.select("q1", "A");
    await h.advance(800);
    q.select("q1", "B");
    await h.advance(5000);
    expect(h.sent.length).toBe(1);
    expect(q.view().q1).toBe("B");
    release({ ok: true, revision: 1 });
    await h.advance(1);
    expect(h.sent.length).toBe(2);
    expect(h.sent[1]).toMatchObject({ baseRevision: 1, changes: [{ examQuestionId: "q1", optionId: "B" }] });
    expect(q.view().q1).toBe("B");
  });

  it("transient failure retries the SAME batch (same mutationId) with backoff before newer changes", async () => {
    const h = harness([() => ({ ok: false, kind: "transient" }), ok(1), ok(2)]);
    const q = new SyncQueue("a", "tok", 0, {}, h.deps);
    q.select("q1", "A");
    await h.advance(800);
    expect(q.status).toBe("retrying");
    q.select("q1", "B");
    await h.advance(1000);
    expect(h.sent.map((b) => [b.mutationId, b.baseRevision, b.changes[0]!.optionId])).toEqual([
      ["m1", 0, "A"],
      ["m1", 0, "A"],
      ["m2", 1, "B"],
    ]);
    expect(q.status).toBe("saved");
  });

  it("respects Retry-After", () => {
    expect(backoffMs(1, 0.5, 7)).toBe(7000);
    expect(backoffMs(1, 0.5)).toBe(1000);
    expect(backoffMs(10, 0.5)).toBe(30_000);
    expect(backoffMs(2, 0)).toBeCloseTo(1400);
  });

  it("revision conflict adopts server state and re-queues local selections (kept visible)", async () => {
    const h = harness([() => ({ ok: false, kind: "conflict", revision: 5, answers: { q1: "X", q2: "Y" } }), ok(6)]);
    const q = new SyncQueue("a", "tok", 0, {}, h.deps);
    q.select("q1", "A");
    await h.advance(800);
    expect(q.view()).toEqual({ q1: "A", q2: "Y" });
    await h.advance(1);
    expect(h.sent[1]).toMatchObject({ baseRevision: 5, changes: [{ examQuestionId: "q1", optionId: "A" }] });
    expect(q.view()).toEqual({ q1: "A", q2: "Y" });
  });

  it("controller change makes the tab read-only without losing local selections", async () => {
    const h = harness([() => ({ ok: false, kind: "controller" }), ok(4)]);
    const q = new SyncQueue("a", "tok", 0, {}, h.deps);
    q.select("q1", "A");
    await h.advance(800);
    expect(q.status).toBe("readonly");
    q.select("q2", "B"); // ignored while read-only
    expect(q.view()).toEqual({ q1: "A" });
    q.becomeController("tok2", 3, { q1: null });
    await h.advance(1);
    expect(h.sent[1]).toMatchObject({ baseRevision: 3, changes: [{ examQuestionId: "q1", optionId: "A" }] });
  });

  it("drainForSubmit includes a selection made just before submit (§19.12)", async () => {
    const h = harness([ok(1)]);
    const q = new SyncQueue("a", "tok", 0, {}, h.deps);
    q.select("q1", "A");
    await h.advance(800);
    q.select("q2", "D"); // clicked, then immediately "Submit"
    const snap = await q.drainForSubmit();
    expect(snap).toEqual({ baseRevision: 1, finalChanges: [{ examQuestionId: "q2", optionId: "D" }], token: "tok" });
  });

  it("restores this user's pending answers and deletes other users' data on a shared device", () => {
    const store = new Map<string, string>([
      [storageKey("other", "x"), JSON.stringify({ pending: { q: "secret" }, inflight: null })],
      [storageKey("me", "a"), JSON.stringify({ pending: { q1: "A" }, inflight: null })],
      ["unrelated", "1"],
    ]);
    const s = {
      get length() {
        return store.size;
      },
      key: (i: number) => [...store.keys()][i] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => void store.delete(k),
    };
    expect(loadLocal(s, "me", "a")).toEqual({ pending: { q1: "A" }, inflight: null });
    expect(store.has(storageKey("other", "x"))).toBe(false);
    expect(store.has("unrelated")).toBe(true);
    expect(loadLocal(s, "me", "other-attempt")).toBeNull();
  });
});

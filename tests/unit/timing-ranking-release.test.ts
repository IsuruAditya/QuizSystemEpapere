import { describe, expect, it } from "vitest";
import { availability, computeDeadline, elapsedMs, isAdmitted, isLateStart, remainingIfStartedAt } from "@/server/assessment/deadline";
import { competitionRank, formatElapsed } from "@/server/results/ranking-rules";
import { releaseState, type ReleaseConfig } from "@/server/results/release-policy";
import { formatColombo, colomboInputToUtc } from "@/lib/time";

const T = (iso: string) => new Date(iso);

describe("deadline rules (§10, §19.9, §19.17, §19.24)", () => {
  it("deadline = start + duration when the exam closes later", () => {
    expect(computeDeadline(T("2026-12-01T04:00:00Z"), 3600, T("2026-12-01T10:00:00Z"))).toEqual(T("2026-12-01T05:00:00Z"));
  });
  it("late start: deadline capped at close time (shorter duration)", () => {
    const start = T("2026-12-01T09:30:00Z");
    const close = T("2026-12-01T10:00:00Z");
    expect(computeDeadline(start, 3600, close)).toEqual(close);
    expect(isLateStart(start, 3600, close)).toBe(true);
    expect(remainingIfStartedAt(start, 3600, close)).toBe(1800);
  });
  it("untimed practice without close → null deadline; with close → close", () => {
    expect(computeDeadline(T("2026-12-01T00:00:00Z"), null, null)).toBeNull();
    expect(computeDeadline(T("2026-12-01T00:00:00Z"), null, T("2026-12-02T00:00:00Z"))).toEqual(T("2026-12-02T00:00:00Z"));
  });
  it("admission is strict: at the deadline instant nothing is admitted", () => {
    const d = T("2026-12-01T05:00:00Z");
    expect(isAdmitted(T("2026-12-01T04:59:59.999Z"), d)).toBe(true);
    expect(isAdmitted(d, d)).toBe(false);
    expect(isAdmitted(T("2026-12-01T05:00:00.001Z"), d)).toBe(false);
    expect(isAdmitted(T("2030-01-01T00:00:00Z"), null)).toBe(true);
  });
  it("elapsed: manual uses receipt; expiry uses deadline regardless of when the worker ran", () => {
    const s = T("2026-12-01T04:00:00Z");
    const d = T("2026-12-01T05:00:00Z");
    expect(elapsedMs("MANUAL", s, T("2026-12-01T04:20:00.250Z"), d)).toBe(20 * 60_000 + 250);
    expect(elapsedMs("EXPIRED", s, T("2026-12-01T07:13:00Z"), d)).toBe(3_600_000);
    expect(elapsedMs("MANUAL", s, T("2026-12-01T05:00:05Z"), d)).toBe(3_600_000);
  });
  it("availability is derived from timestamps", () => {
    const w = { opensAt: T("2026-12-01T04:00:00Z"), closesAt: T("2026-12-01T10:00:00Z") };
    expect(availability(w, T("2026-12-01T03:59:59Z"))).toBe("UPCOMING");
    expect(availability(w, T("2026-12-01T04:00:00Z"))).toBe("OPEN");
    expect(availability(w, T("2026-12-01T10:00:00Z"))).toBe("CLOSED");
    expect(availability({ opensAt: null, closesAt: null }, T("2026-12-01T00:00:00Z"))).toBe("OPEN");
  });
  it("Asia/Colombo display and input conversion (UTC+05:30, no DST)", () => {
    expect(formatColombo(T("2026-12-01T04:30:00Z"), "en")).toContain("10:00");
    expect(colomboInputToUtc("2026-12-01T10:00")?.toISOString()).toBe("2026-12-01T04:30:00.000Z");
    expect(colomboInputToUtc("2026-12-01T00:15")?.toISOString()).toBe("2026-11-30T18:45:00.000Z");
    expect(colomboInputToUtc("not a date")).toBeNull();
  });
});

describe("competition ranking (§13 required examples, §19.18)", () => {
  const min = (n: number) => n * 60_000;
  it("20/20 in 55 min outranks 19/20 in 20 min", () => {
    const r = competitionRank([
      { attemptId: "b", score: 19, elapsedMs: min(20) },
      { attemptId: "a", score: 20, elapsedMs: min(55) },
    ]);
    expect(r.map((x) => [x.attemptId, x.rank])).toEqual([["a", 1], ["b", 2]]);
  });
  it("18/20 in 30 min outranks 18/20 in 60 min", () => {
    const r = competitionRank([
      { attemptId: "slow", score: 18, elapsedMs: min(60) },
      { attemptId: "fast", score: 18, elapsedMs: min(30) },
    ]);
    expect(r[0]!.attemptId).toBe("fast");
    expect(r[1]!.rank).toBe(2);
  });
  it("identical score and time share rank; next rank skips (1,2,2,4)", () => {
    const r = competitionRank([
      { attemptId: "a", score: 20, elapsedMs: 1000 },
      { attemptId: "c", score: 18, elapsedMs: 5000 },
      { attemptId: "b", score: 18, elapsedMs: 5000 },
      { attemptId: "d", score: 18, elapsedMs: 5001 },
    ]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 2, 4]);
    expect(r.map((x) => x.attemptId)).toEqual(["a", "b", "c", "d"]);
  });
  it("formats elapsed with tenths", () => {
    expect(formatElapsed(0)).toBe("0:00.0");
    expect(formatElapsed(65_432)).toBe("1:05.4");
    expect(formatElapsed(3_600_000 + 61_999)).toBe("1:01:01.9");
  });
});

describe("release policy (§14, §19.20)", () => {
  const close = T("2026-12-01T10:00:00Z");
  const ranked: ReleaseConfig = {
    scoreVisibility: "IMMEDIATE",
    correctnessVisibility: "AFTER_RELEASE",
    answerVisibility: "AFTER_RELEASE",
    explanationVisibility: "AFTER_RELEASE",
    reviewReleaseAt: null,
    closesAt: close,
  };
  it("ranked default: score now, details only after close", () => {
    expect(releaseState(ranked, T("2026-12-01T09:00:00Z"))).toMatchObject({ score: true, correctness: false, correctAnswer: false, explanation: false });
    expect(releaseState(ranked, close)).toMatchObject({ score: true, correctness: true, correctAnswer: true, explanation: true });
  });
  it("explicit release time overrides close time", () => {
    const cfg = { ...ranked, reviewReleaseAt: T("2026-12-02T00:00:00Z") };
    expect(releaseState(cfg, T("2026-12-01T12:00:00Z")).correctness).toBe(false);
    expect(releaseState(cfg, T("2026-12-02T00:00:00Z")).correctness).toBe(true);
  });
  it("NEVER hides; correct answer and explanation require correctness visibility", () => {
    const cfg: ReleaseConfig = { ...ranked, correctnessVisibility: "NEVER", answerVisibility: "IMMEDIATE", explanationVisibility: "IMMEDIATE" };
    expect(releaseState(cfg, T("2030-01-01T00:00:00Z"))).toMatchObject({ correctness: false, correctAnswer: false, explanation: false });
  });
  it("AFTER_RELEASE with no release instant stays hidden", () => {
    expect(releaseState({ ...ranked, closesAt: null }, T("2030-01-01T00:00:00Z")).correctness).toBe(false);
  });
});

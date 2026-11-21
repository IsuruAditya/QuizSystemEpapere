import { describe, expect, it } from "vitest";
import { gradeAttempt, GradingError, percentBasisPoints, type KeyEntry } from "@/server/assessment/grading";

// Independently computed fixture: 5 slots, weights 1,1,2,3,1 (max 8). Options per slot: o{slot}{A..D}.
const keys: KeyEntry[] = [
  { examQuestionId: "q1", correctOptionId: "o1A", marks: 1 }, // first option correct
  { examQuestionId: "q2", correctOptionId: "o2D", marks: 1 }, // last option correct
  { examQuestionId: "q3", correctOptionId: "o3B", marks: 2 },
  { examQuestionId: "q4", correctOptionId: "o4C", marks: 3 },
  { examQuestionId: "q5", correctOptionId: "o5B", marks: 1 },
];
const m = (o: Record<string, string | null>) => new Map(Object.entries(o));

describe("gradeAttempt (§19.4, §19.5)", () => {
  it("all correct → full marks", () => {
    const r = gradeAttempt(keys, m({ q1: "o1A", q2: "o2D", q3: "o3B", q4: "o4C", q5: "o5B" }));
    expect(r).toMatchObject({ score: 8, maxScore: 8, percentBp: 10000, correctCount: 5, answeredCount: 5 });
  });
  it("all wrong → genuine zero", () => {
    const r = gradeAttempt(keys, m({ q1: "o1B", q2: "o2A", q3: "o3A", q4: "o4D", q5: "o5C" }));
    expect(r).toMatchObject({ score: 0, maxScore: 8, percentBp: 0, correctCount: 0, answeredCount: 5 });
  });
  it("partial + weighted: q1(1)+q4(3) correct = 4/8", () => {
    const r = gradeAttempt(keys, m({ q1: "o1A", q2: "o2C", q3: "o3D", q4: "o4C", q5: "o5A" }));
    expect(r).toMatchObject({ score: 4, maxScore: 8, percentBp: 5000, correctCount: 2 });
  });
  it("unanswered and explicit null count as zero, not errors", () => {
    const r = gradeAttempt(keys, m({ q2: "o2D", q3: null }));
    expect(r).toMatchObject({ score: 1, maxScore: 8, answeredCount: 1, correctCount: 1 });
    expect(r.perQuestion.find((p) => p.examQuestionId === "q3")).toMatchObject({ selectedOptionId: null, correct: false, awarded: 0 });
  });
  it("no answers at all → 0 of max", () => {
    expect(gradeAttempt(keys, new Map())).toMatchObject({ score: 0, maxScore: 8, answeredCount: 0 });
  });
  it("first and last option keys are both graded by stable option ID", () => {
    expect(gradeAttempt(keys, m({ q1: "o1A" })).score).toBe(1);
    expect(gradeAttempt(keys, m({ q2: "o2D" })).score).toBe(1);
    expect(gradeAttempt(keys, m({ q1: "o1D", q2: "o2A" })).score).toBe(0);
  });
  it("rejects answers to slots outside the exam version", () => {
    expect(() => gradeAttempt(keys, m({ foreign: "x" }))).toThrow(GradingError);
  });
  it("rejects invalid keys instead of producing a fake score", () => {
    expect(() => gradeAttempt([], new Map())).toThrow(GradingError);
    expect(() => gradeAttempt([{ examQuestionId: "a", correctOptionId: "x", marks: 0 }], new Map())).toThrow(GradingError);
    expect(() => gradeAttempt([{ examQuestionId: "a", correctOptionId: "", marks: 1 }], new Map())).toThrow(GradingError);
  });
  it("percentage rounds half up in basis points", () => {
    expect(percentBasisPoints(1, 3)).toBe(3333);
    expect(percentBasisPoints(2, 3)).toBe(6667);
    expect(percentBasisPoints(19, 20)).toBe(9500);
  });
});

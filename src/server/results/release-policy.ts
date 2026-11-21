/**
 * Pure release policy (R8.1). Every review endpoint calls this; UI toggles are not protection.
 */
export type Visibility = "IMMEDIATE" | "AFTER_RELEASE" | "NEVER";

export interface ReleaseConfig {
  scoreVisibility: Visibility;
  correctnessVisibility: Visibility;
  answerVisibility: Visibility;
  explanationVisibility: Visibility;
  reviewReleaseAt: Date | null;
  closesAt: Date | null;
}

export interface ReleaseState {
  score: boolean;
  correctness: boolean;
  correctAnswer: boolean;
  explanation: boolean;
  /** When AFTER_RELEASE items become visible (null if never/immediate-only). */
  releaseAt: Date | null;
}

export function releaseAt(cfg: ReleaseConfig): Date | null {
  return cfg.reviewReleaseAt ?? cfg.closesAt;
}

function visible(v: Visibility, cfg: ReleaseConfig, now: Date): boolean {
  if (v === "IMMEDIATE") return true;
  if (v === "NEVER") return false;
  const at = releaseAt(cfg);
  // AFTER_RELEASE without any release instant (untimed practice without close) stays hidden.
  return at !== null && now.getTime() >= at.getTime();
}

/** What a student may see for a finalised, graded attempt at `now`. */
export function releaseState(cfg: ReleaseConfig, now: Date): ReleaseState {
  const score = visible(cfg.scoreVisibility, cfg, now);
  const correctness = visible(cfg.correctnessVisibility, cfg, now);
  // Revealing the correct answer implies correctness; revealing an explanation may reveal the answer,
  // so each requires its own flag AND the correctness flag.
  const correctAnswer = correctness && visible(cfg.answerVisibility, cfg, now);
  const explanation = correctAnswer && visible(cfg.explanationVisibility, cfg, now);
  return { score, correctness, correctAnswer, explanation, releaseAt: releaseAt(cfg) };
}

export const DEFAULT_RELEASE = {
  PRACTICE: { scoreVisibility: "IMMEDIATE", correctnessVisibility: "IMMEDIATE", answerVisibility: "IMMEDIATE", explanationVisibility: "IMMEDIATE" },
  RANKED: { scoreVisibility: "IMMEDIATE", correctnessVisibility: "AFTER_RELEASE", answerVisibility: "AFTER_RELEASE", explanationVisibility: "AFTER_RELEASE" },
} as const;

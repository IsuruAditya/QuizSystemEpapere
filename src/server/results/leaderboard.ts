import "server-only";
import { db } from "../db";

/**
 * Per-exam leaderboard (R7.x, ADR-006). Every query filters by ONE exam id before ranking.
 * Eligible: OFFICIAL, GRADED, not void, graded on the version's latest grading revision.
 * Order: score DESC, elapsed_ms ASC; RANK() gives competition ranking (1,2,2,4).
 */
export interface LeaderboardRow {
  rank: number;
  attemptId: string;
  displayName: string;
  score: number;
  maxScore: number;
  elapsedMs: number;
  isMe: boolean;
}

export interface RankingStatus {
  state: "PROVISIONAL" | "FINAL";
  reasons: ("EXAM_OPEN" | "ATTEMPTS_IN_PROGRESS" | "GRADING_PENDING" | "REGRADE_PENDING")[];
  rankingRevision: number;
  rankingNote: string | null;
  inProgress: number;
  ungraded: number;
  staleRevision: number;
}

export interface Leaderboard {
  examId: string;
  total: number;
  page: number;
  pageSize: number;
  rows: LeaderboardRow[];
  me: LeaderboardRow | null;
  status: RankingStatus;
}

export async function getLeaderboard(examId: string, opts: { page: number; pageSize: number; viewerId: string | null }): Promise<Leaderboard> {
  const pageSize = Math.min(Math.max(opts.pageSize, 1), 100);
  const page = Math.max(opts.page, 1);
  const offset = (page - 1) * pageSize;
  const rows = await db.$queryRaw<
    { rank: bigint; attempt_id: string; user_id: string; display_name: string; score: number; max_score: number; elapsed_ms: number; total: bigint }[]
  >`
    WITH eligible AS (
      SELECT a.id, a.user_id, a.score, a.max_score, a.elapsed_ms
      FROM attempt a JOIN exam_version v ON v.id = a.exam_version_id
      WHERE a.exam_id = ${examId}::uuid AND a.kind = 'OFFICIAL' AND a.status = 'GRADED' AND a.voided_at IS NULL
        AND a.grading_revision_id = v.latest_grading_revision_id),
    ranked AS (
      SELECT e.*, RANK() OVER (ORDER BY e.score DESC, e.elapsed_ms ASC) AS rank, COUNT(*) OVER () AS total FROM eligible e)
    SELECT r.rank, r.id AS attempt_id, r.user_id, COALESCE(p.display_name, 'Student') AS display_name,
           r.score, r.max_score, r.elapsed_ms, r.total
    FROM ranked r LEFT JOIN student_profile p ON p.user_id = r.user_id
    ORDER BY r.rank, r.elapsed_ms, r.id
    LIMIT ${pageSize} OFFSET ${offset}`;
  const map = (r: (typeof rows)[number]): LeaderboardRow => ({
    rank: Number(r.rank),
    attemptId: r.attempt_id,
    displayName: r.display_name,
    score: r.score,
    maxScore: r.max_score,
    elapsedMs: r.elapsed_ms,
    isMe: r.user_id === opts.viewerId,
  });
  let total = rows[0] ? Number(rows[0].total) : 0;
  if (!rows[0] && page > 1) total = await countEligible(examId);
  const me = opts.viewerId ? await myRank(examId, opts.viewerId) : null;
  return { examId, total, page, pageSize, rows: rows.map(map), me, status: await rankingStatus(examId) };
}

async function countEligible(examId: string): Promise<number> {
  const r = await db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM attempt a JOIN exam_version v ON v.id = a.exam_version_id
    WHERE a.exam_id = ${examId}::uuid AND a.kind = 'OFFICIAL' AND a.status = 'GRADED' AND a.voided_at IS NULL
      AND a.grading_revision_id = v.latest_grading_revision_id`;
  return r[0]?.n ?? 0;
}

/** Own rank regardless of page: 1 + number of eligible rows strictly better. */
export async function myRank(examId: string, userId: string): Promise<LeaderboardRow | null> {
  const r = await db.$queryRaw<{ attempt_id: string; display_name: string; score: number; max_score: number; elapsed_ms: number; rank: number }[]>`
    WITH eligible AS (
      SELECT a.id, a.user_id, a.score, a.max_score, a.elapsed_ms
      FROM attempt a JOIN exam_version v ON v.id = a.exam_version_id
      WHERE a.exam_id = ${examId}::uuid AND a.kind = 'OFFICIAL' AND a.status = 'GRADED' AND a.voided_at IS NULL
        AND a.grading_revision_id = v.latest_grading_revision_id)
    SELECT m.id AS attempt_id, COALESCE(p.display_name, 'Student') AS display_name, m.score, m.max_score, m.elapsed_ms,
      (1 + (SELECT COUNT(*) FROM eligible o WHERE o.score > m.score OR (o.score = m.score AND o.elapsed_ms < m.elapsed_ms)))::int AS rank
    FROM eligible m LEFT JOIN student_profile p ON p.user_id = m.user_id
    WHERE m.user_id = ${userId}`;
  const x = r[0];
  return x ? { rank: x.rank, attemptId: x.attempt_id, displayName: x.display_name, score: x.score, maxScore: x.max_score, elapsedMs: x.elapsed_ms, isMe: true } : null;
}

/**
 * FINAL only when: close time passed, no official attempts in progress or awaiting grading,
 * and every graded official attempt is on the latest grading revision (no pending regrade).
 */
export async function rankingStatus(examId: string): Promise<RankingStatus> {
  const r = await db.$queryRaw<{ closed: boolean; in_progress: number; ungraded: number; stale: number; ranking_revision: number; ranking_note: string | null }[]>`
    SELECT (e.closes_at IS NOT NULL AND e.closes_at <= clock_timestamp()) AS closed, e.ranking_revision, e.ranking_note,
      (SELECT COUNT(*)::int FROM attempt a WHERE a.exam_id = e.id AND a.kind = 'OFFICIAL' AND a.voided_at IS NULL AND a.status = 'IN_PROGRESS') AS in_progress,
      (SELECT COUNT(*)::int FROM attempt a WHERE a.exam_id = e.id AND a.kind = 'OFFICIAL' AND a.voided_at IS NULL AND a.status = 'SUBMITTED') AS ungraded,
      (SELECT COUNT(*)::int FROM attempt a JOIN exam_version v ON v.id = a.exam_version_id
         WHERE a.exam_id = e.id AND a.kind = 'OFFICIAL' AND a.voided_at IS NULL AND a.status = 'GRADED'
           AND a.grading_revision_id <> v.latest_grading_revision_id) AS stale
    FROM exam e WHERE e.id = ${examId}::uuid`;
  const x = r[0];
  if (!x) return { state: "PROVISIONAL", reasons: ["EXAM_OPEN"], rankingRevision: 0, rankingNote: null, inProgress: 0, ungraded: 0, staleRevision: 0 };
  const reasons: RankingStatus["reasons"] = [];
  if (!x.closed) reasons.push("EXAM_OPEN");
  if (x.in_progress > 0) reasons.push("ATTEMPTS_IN_PROGRESS");
  if (x.ungraded > 0) reasons.push("GRADING_PENDING");
  if (x.stale > 0) reasons.push("REGRADE_PENDING");
  return {
    state: reasons.length ? "PROVISIONAL" : "FINAL",
    reasons,
    rankingRevision: x.ranking_revision,
    rankingNote: x.ranking_note,
    inProgress: x.in_progress,
    ungraded: x.ungraded,
    staleRevision: x.stale,
  };
}

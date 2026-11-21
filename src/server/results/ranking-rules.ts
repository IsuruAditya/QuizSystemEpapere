/**
 * Pure reference implementation of per-exam competition ranking (ADR-006).
 * The production query is SQL (RANK() OVER ...); tests assert both agree.
 */
export interface RankInput {
  attemptId: string;
  score: number;
  elapsedMs: number;
}

export interface Ranked extends RankInput {
  rank: number;
}

/** score DESC, elapsedMs ASC; exact ties share a rank (1,2,2,4); attemptId only stabilises order. */
export function competitionRank(rows: readonly RankInput[]): Ranked[] {
  const sorted = [...rows].sort(
    (a, b) => b.score - a.score || a.elapsedMs - b.elapsedMs || (a.attemptId < b.attemptId ? -1 : a.attemptId > b.attemptId ? 1 : 0),
  );
  const out: Ranked[] = [];
  sorted.forEach((r, i) => {
    const prev = out[i - 1];
    const rank = prev && prev.score === r.score && prev.elapsedMs === r.elapsedMs ? prev.rank : i + 1;
    out.push({ ...r, rank });
  });
  return out;
}

/** Display elapsed time as m:ss.t (tenths); exact milliseconds are shown in the detail view. */
export function formatElapsed(ms: number): string {
  const tenths = Math.floor(ms / 100);
  const totalSec = Math.floor(tenths / 10);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const t = tenths % 10;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}.${t}` : `${m}:${ss}.${t}`;
}

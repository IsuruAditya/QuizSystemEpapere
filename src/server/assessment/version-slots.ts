import "server-only";
import type { Tx } from "../db";

export interface SlotInfo {
  questionVersionId: string;
  optionIds: Set<string>;
}

/**
 * Slot membership for an exam version. Published versions are immutable, so a small per-instance
 * cache is safe (it is a cache of immutable facts, never an authoritative store; FKs still enforce).
 */
const cache = new Map<string, Map<string, SlotInfo>>();
const MAX = 200;

export async function versionSlots(t: Tx, examVersionId: string): Promise<Map<string, SlotInfo>> {
  const hit = cache.get(examVersionId);
  if (hit) return hit;
  const rows = await t.examQuestion.findMany({
    where: { examVersionId },
    select: { id: true, questionVersionId: true, questionVersion: { select: { options: { select: { id: true } } } } },
  });
  const m = new Map<string, SlotInfo>(
    rows.map((r) => [r.id, { questionVersionId: r.questionVersionId, optionIds: new Set(r.questionVersion.options.map((o) => o.id)) }]),
  );
  if (cache.size >= MAX) cache.delete(cache.keys().next().value as string);
  cache.set(examVersionId, m);
  return m;
}

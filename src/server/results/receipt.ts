import "server-only";
import type { Actor } from "../auth/actor";
import { submitAttempt, submitBody, type SubmitBody } from "../assessment/attempts";
import { getResultForStudent, type ResultView } from "./review";

export { submitBody };

export interface SubmitReceipt extends ResultView {
  appliedFinalChanges: boolean;
}

/** Submit use case: finalise (transactional, idempotent), then build the release-filtered receipt. */
export async function submitAndReceipt(actor: Actor, attemptId: string, body: SubmitBody): Promise<SubmitReceipt> {
  const r = await submitAttempt(actor, attemptId, body);
  return { ...(await getResultForStudent(actor.userId, attemptId)), appliedFinalChanges: r.appliedFinalChanges };
}

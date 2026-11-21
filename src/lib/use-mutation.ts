"use client";
import { useCallback, useState } from "react";
import { toApiError, type ApiError } from "./api-client";

export interface Mutation<A extends unknown[], R> {
  /** Runs the call; resolves to the result, or `undefined` when it failed (error state is set). */
  run: (...args: A) => Promise<R | undefined>;
  busy: boolean;
  /** Human-readable message for an alert (server title, or the fallback). */
  error: string | null;
  /** Per-field messages from RFC 9457 `errors[]` (path → message). */
  fieldErrors: Record<string, string>;
  /** Last raw error, for callers that branch on `code`. */
  lastError: ApiError | null;
  setError: (msg: string | null) => void;
  reset: () => void;
}

/**
 * The one place that handles busy/error state for client API calls (DRY across all forms).
 * `describe` maps an ApiError to a localised message when the server title is not suitable.
 */
export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>, opts: { fallback?: string; describe?: (e: ApiError) => string | null } = {}): Mutation<A, R> {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [lastError, setLastError] = useState<ApiError | null>(null);
  const { fallback = "Something went wrong.", describe } = opts;

  const run = useCallback(
    async (...args: A) => {
      setBusy(true);
      setError(null);
      setFieldErrors({});
      setLastError(null);
      try {
        return await fn(...args);
      } catch (e) {
        const a = toApiError(e);
        setLastError(a);
        setFieldErrors(a.fieldErrors());
        setError(describe?.(a) ?? a.problem?.title ?? fallback);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [fn, describe, fallback],
  );
  const reset = useCallback(() => {
    setError(null);
    setFieldErrors({});
    setLastError(null);
  }, []);
  return { run, busy, error, fieldErrors, lastError, setError, reset };
}

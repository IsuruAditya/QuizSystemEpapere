/** Stable machine-readable error codes shared by server and client (RFC 9457 `code` extension). */
export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "ACCESS_DENIED",
  "PASSWORD_CHANGE_REQUIRED",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "NOT_OPEN",
  "CLOSED",
  "NO_ATTEMPTS_REMAINING",
  "ATTEMPT_FINALIZED",
  "REVISION_CONFLICT",
  "CONTROLLER_CHANGED",
  "INVALID_OPTION",
  "CONFLICT",
  "RATE_LIMITED",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA",
  "TEMPORARY_FAILURE",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: ErrorCode;
  requestId?: string;
  errors?: { path: string; message: string }[];
  [ext: string]: unknown;
}

/** Codes a client may retry automatically (with backoff). */
export function isRetryable(code: ErrorCode | undefined, status: number): boolean {
  return code === "TEMPORARY_FAILURE" || code === "RATE_LIMITED" || status >= 500 || status === 0;
}

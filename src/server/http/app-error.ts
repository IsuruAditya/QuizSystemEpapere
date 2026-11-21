import type { ErrorCode } from "@/lib/errors";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  ACCESS_DENIED: 403,
  PASSWORD_CHANGE_REQUIRED: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  NOT_OPEN: 409,
  CLOSED: 409,
  NO_ATTEMPTS_REMAINING: 409,
  ATTEMPT_FINALIZED: 409,
  REVISION_CONFLICT: 409,
  CONTROLLER_CHANGED: 409,
  INVALID_OPTION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  TEMPORARY_FAILURE: 503,
  INTERNAL: 500,
};

/** Domain error thrown by services; mapped to RFC 9457 problem details by withRoute(). */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly extra: Record<string, unknown> = {},
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}

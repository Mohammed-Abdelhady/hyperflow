/**
 * Typed domain errors — thrown by services, mapped to envelopes in routes.
 * No HTTP status or envelope construction here (spec §3B.15).
 */
import { ERROR_CODES, type ErrorCode } from "@shared/schemas/api.js";

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(ERROR_CODES.VALIDATION_FAILED, message, details);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Resource not found", details?: unknown) {
    super(ERROR_CODES.NOT_FOUND, message, details);
    this.name = "NotFoundError";
  }
}

export class PathBlockedError extends DomainError {
  constructor(message = "Path is not writable", details?: unknown) {
    super(ERROR_CODES.PATH_BLOCKED, message, details);
    this.name = "PathBlockedError";
  }
}

export class WriteConflictError extends DomainError {
  constructor(message = "Write conflict", details?: unknown) {
    super(ERROR_CODES.WRITE_CONFLICT, message, details);
    this.name = "WriteConflictError";
  }
}

export class IllegalTransitionError extends WriteConflictError {
  constructor(current: string, requested: string) {
    super("Illegal handoff status transition", { current, requested });
    this.name = "IllegalTransitionError";
  }
}

export class ObserveModeError extends DomainError {
  constructor(message = "Filesystem is read-only (observe mode)") {
    super(ERROR_CODES.PATH_BLOCKED, message, { observeMode: true });
    this.name = "ObserveModeError";
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}

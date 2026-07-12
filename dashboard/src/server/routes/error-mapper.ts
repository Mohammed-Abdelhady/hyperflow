/**
 * Central error mapper — sole builder of `{code, message, details?}` envelopes.
 */
import type { ErrorHandler, MiddlewareHandler } from "hono";
import { ZodError } from "zod";
import {
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  type ErrorCode,
  type ErrorEnvelope,
} from "@shared/schemas/api.js";
import { DomainError, isDomainError } from "../services/errors.js";

type StatusCode = 400 | 401 | 403 | 404 | 409 | 500;

function statusFor(code: ErrorCode): StatusCode {
  return ERROR_HTTP_STATUS[code] as StatusCode;
}

export function envelopeForDomain(err: DomainError): {
  body: ErrorEnvelope;
  status: StatusCode;
} {
  const body: ErrorEnvelope = {
    code: err.code,
    message: err.message,
  };
  if (err.details !== undefined) body.details = err.details;
  return { body, status: statusFor(err.code) };
}

export function envelopeForUnknown(_err: unknown): {
  body: ErrorEnvelope;
  status: 500;
} {
  return {
    body: {
      code: ERROR_CODES.INTERNAL,
      message: "Internal server error",
    },
    status: 500,
  };
}

export function envelopeForZod(err: ZodError): {
  body: ErrorEnvelope;
  status: 400;
} {
  return {
    body: {
      code: ERROR_CODES.VALIDATION_FAILED,
      message: "Request validation failed",
      details: err.flatten(),
    },
    status: 400,
  };
}

/** Hono onError handler — maps typed domain / Zod / unknown errors. */
export function createErrorHandler(): ErrorHandler {
  return (err, c) => {
    if (err instanceof ZodError) {
      const { body, status } = envelopeForZod(err);
      return c.json(body, status);
    }
    if (isDomainError(err)) {
      const { body, status } = envelopeForDomain(err);
      return c.json(body, status);
    }
    const { body, status } = envelopeForUnknown(err);
    return c.json(body, status);
  };
}

/**
 * Middleware that catches thrown errors inside the route chain and maps them.
 * Security middleware that returns envelopes directly is unaffected.
 */
export function errorMapperMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    try {
      await next();
    } catch (err) {
      if (err instanceof ZodError) {
        const { body, status } = envelopeForZod(err);
        return c.json(body, status);
      }
      if (isDomainError(err)) {
        const { body, status } = envelopeForDomain(err);
        return c.json(body, status);
      }
      const { body, status } = envelopeForUnknown(err);
      return c.json(body, status);
    }
    return;
  };
}

export function notFoundEnvelope(): ErrorEnvelope {
  return {
    code: ERROR_CODES.NOT_FOUND,
    message: "Not found",
  };
}

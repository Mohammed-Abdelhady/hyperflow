import {
  ErrorEnvelopeSchema,
  type ErrorCode,
  type ErrorEnvelope,
} from "@shared/schemas/index.js";

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;
  readonly status: number;

  constructor(envelope: ErrorEnvelope, status: number) {
    super(envelope.message);
    this.name = "ApiError";
    this.code = envelope.code;
    this.details = envelope.details;
    this.status = status;
  }
}

export function parseApiError(body: unknown, status: number): ApiError {
  const parsed = ErrorEnvelopeSchema.safeParse(body);
  if (parsed.success) {
    return new ApiError(parsed.data, status);
  }
  return new ApiError(
    {
      code: "INTERNAL",
      message: `Unexpected error response (${status})`,
      details: body,
    },
    status,
  );
}

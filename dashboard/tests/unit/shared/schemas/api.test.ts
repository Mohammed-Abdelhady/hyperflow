import { describe, expect, it } from "vitest";
import {
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  ErrorEnvelopeSchema,
  HYPERFLOW_TOKEN_HEADER,
  httpStatusForErrorCode,
} from "../../../../src/shared/schemas/api.js";

describe("api error envelope", () => {
  it("accepts a valid WRITE_CONFLICT envelope with details", () => {
    const parsed = ErrorEnvelopeSchema.safeParse({
      code: "WRITE_CONFLICT",
      message: "mtime mismatch",
      details: { mtime: 1 },
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.code).toBe(ERROR_CODES.WRITE_CONFLICT);
    expect(parsed.data.details).toEqual({ mtime: 1 });
  });

  it("rejects bare {error:string} bodies", () => {
    const parsed = ErrorEnvelopeSchema.safeParse({ error: "boom" });
    expect(parsed.success).toBe(false);
  });

  it("maps codes to HTTP status deterministically", () => {
    expect(httpStatusForErrorCode(ERROR_CODES.VALIDATION_FAILED)).toBe(400);
    expect(httpStatusForErrorCode(ERROR_CODES.TOKEN_INVALID)).toBe(401);
    expect(httpStatusForErrorCode(ERROR_CODES.ORIGIN_DENIED)).toBe(403);
    expect(httpStatusForErrorCode(ERROR_CODES.PATH_BLOCKED)).toBe(403);
    expect(httpStatusForErrorCode(ERROR_CODES.NOT_FOUND)).toBe(404);
    expect(httpStatusForErrorCode(ERROR_CODES.WRITE_CONFLICT)).toBe(409);
    expect(httpStatusForErrorCode(ERROR_CODES.INTERNAL)).toBe(500);
    expect(ERROR_HTTP_STATUS).toEqual({
      VALIDATION_FAILED: 400,
      TOKEN_INVALID: 401,
      ORIGIN_DENIED: 403,
      PATH_BLOCKED: 403,
      NOT_FOUND: 404,
      WRITE_CONFLICT: 409,
      INTERNAL: 500,
    });
  });

  it("exports the token header constant", () => {
    expect(HYPERFLOW_TOKEN_HEADER).toBe("X-Hyperflow-Token");
  });
});

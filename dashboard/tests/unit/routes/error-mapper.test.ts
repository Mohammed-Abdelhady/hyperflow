import { describe, expect, it } from "vitest";
import { ZodError, z } from "zod";
import {
  envelopeForDomain,
  envelopeForUnknown,
  envelopeForZod,
} from "../../../src/server/routes/error-mapper.js";
import {
  DomainError,
  IllegalTransitionError,
  NotFoundError,
  PathBlockedError,
  ValidationError,
  WriteConflictError,
} from "../../../src/server/services/errors.js";
import { ERROR_CODES } from "../../../src/shared/schemas/api.js";

describe("error mapper", () => {
  it("maps each domain error class to envelope + status", () => {
    const cases: Array<[DomainError, string, number]> = [
      [new ValidationError("bad"), ERROR_CODES.VALIDATION_FAILED, 400],
      [new NotFoundError(), ERROR_CODES.NOT_FOUND, 404],
      [new PathBlockedError(), ERROR_CODES.PATH_BLOCKED, 403],
      [new WriteConflictError("mtime"), ERROR_CODES.WRITE_CONFLICT, 409],
      [
        new IllegalTransitionError("built", "planned"),
        ERROR_CODES.WRITE_CONFLICT,
        409,
      ],
      [
        new DomainError(ERROR_CODES.TOKEN_INVALID, "nope"),
        ERROR_CODES.TOKEN_INVALID,
        401,
      ],
      [
        new DomainError(ERROR_CODES.ORIGIN_DENIED, "no"),
        ERROR_CODES.ORIGIN_DENIED,
        403,
      ],
      [
        new DomainError(ERROR_CODES.INTERNAL, "boom"),
        ERROR_CODES.INTERNAL,
        500,
      ],
    ];
    for (const [err, code, status] of cases) {
      const mapped = envelopeForDomain(err);
      expect(mapped.body.code).toBe(code);
      expect(mapped.status).toBe(status);
      expect(mapped.body.message.length).toBeGreaterThan(0);
    }
  });

  it("unknown Error → 500 INTERNAL with no stack leak", () => {
    const mapped = envelopeForUnknown(new Error("secret stack stuff"));
    expect(mapped.status).toBe(500);
    expect(mapped.body.code).toBe(ERROR_CODES.INTERNAL);
    expect(JSON.stringify(mapped.body)).not.toContain("secret");
  });

  it("ZodError → 400 with issues in details", () => {
    const schema = z.object({ x: z.string() });
    const result = schema.safeParse({ x: 1 });
    expect(result.success).toBe(false);
    if (result.success) return;
    const mapped = envelopeForZod(result.error as ZodError);
    expect(mapped.status).toBe(400);
    expect(mapped.body.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    expect(mapped.body.details).toBeTruthy();
  });

  it("illegal transition details carry current/requested", () => {
    const err = new IllegalTransitionError("reviewed", "built");
    const mapped = envelopeForDomain(err);
    expect(mapped.body.details).toEqual({
      current: "reviewed",
      requested: "built",
    });
  });
});

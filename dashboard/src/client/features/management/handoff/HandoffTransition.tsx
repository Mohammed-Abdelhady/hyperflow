import { memo } from "react";
import type { HandoffStatus } from "@shared/schemas/index.js";
import { legalNext } from "./useHandoffMutations";

export interface HandoffTransitionProps {
  slug: string;
  status: HandoffStatus;
  disabled?: boolean;
  disabledTitle?: string | null;
  inFlight?: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  onTransition: (slug: string, status: HandoffStatus) => void;
  testId?: string;
}

function mapErrorCopy(code: string | null, message: string | null): string {
  if (!code) return message ?? "";
  if (code === "WRITE_CONFLICT") {
    return `Conflict: ${message ?? "STATUS changed elsewhere — refresh and retry"}`;
  }
  if (code === "PATH_BLOCKED") {
    return `Denied: ${message ?? "path blocked"}`;
  }
  if (code === "VALIDATION_FAILED") {
    return `Illegal transition: ${message ?? "server rejected STATUS change"}`;
  }
  return `[${code}] ${message ?? "error"}`;
}

function HandoffTransitionImpl({
  slug,
  status,
  disabled = false,
  disabledTitle,
  inFlight = false,
  errorCode,
  errorMessage,
  onTransition,
  testId = "handoff-transition",
}: HandoffTransitionProps) {
  const next = legalNext(status);
  const errorCopy = mapErrorCopy(errorCode, errorMessage);

  return (
    <div data-testid={`${testId}-${slug}`}>
      {next ? (
        <button
          type="button"
          className="hf-btn hf-btn--primary"
          data-testid={`${testId}-btn-${slug}`}
          disabled={disabled || inFlight}
          title={disabledTitle ?? `Advance to ${next}`}
          onClick={() => onTransition(slug, status)}
        >
          {inFlight ? "Advancing…" : `Advance to ${next}`}
        </button>
      ) : (
        <span className="hf-replay__note" data-testid={`${testId}-terminal-${slug}`}>
          Terminal STATUS — no further transitions
        </span>
      )}
      {errorCopy ? (
        <p
          className="hf-error-inline"
          data-testid={`${testId}-error-${slug}`}
          data-error-code={errorCode ?? undefined}
        >
          {errorCopy}
        </p>
      ) : null}
    </div>
  );
}

export const HandoffTransition = memo(HandoffTransitionImpl);

import { useMutation } from "@tanstack/react-query";
import {
  HandoffTransitionResponseSchema,
  type HandoffStatus,
} from "@shared/schemas/index.js";
import { useCallback, useState } from "react";
import { QUERY_KEYS } from "../../../constants/query-keys";
import { apiClient } from "../../../services/api";
import { ApiError } from "../../../services/api-error";

export type HandoffPhase = "idle" | "in-flight" | "error";

export interface HandoffMutationState {
  phase: HandoffPhase;
  errorCode: string | null;
  errorMessage: string | null;
  slug: string | null;
}

const idle: HandoffMutationState = {
  phase: "idle",
  errorCode: null,
  errorMessage: null,
  slug: null,
};

/** Legal forward-only transitions (planned → built → reviewed). */
export const HANDOFF_NEXT: Readonly<
  Record<HandoffStatus, HandoffStatus | null>
> = {
  planned: "built",
  built: "reviewed",
  reviewed: null,
  unknown: null,
};

export function legalNext(status: HandoffStatus): HandoffStatus | null {
  return HANDOFF_NEXT[status] ?? null;
}

function newWriteId(): string {
  return `ho-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useHandoffMutations() {
  const [state, setState] = useState<HandoffMutationState>(idle);

  const mutation = useMutation({
    mutationKey: QUERY_KEYS.HANDOFF,
    mutationFn: async (input: {
      slug: string;
      status: "planned" | "built" | "reviewed";
      writeId: string;
    }) => {
      return apiClient.postJson(
        "/handoff/transition",
        input,
        (json) => HandoffTransitionResponseSchema.parse(json),
      );
    },
  });

  const transition = useCallback(
    async (slug: string, current: HandoffStatus) => {
      const next = legalNext(current);
      if (next !== "planned" && next !== "built" && next !== "reviewed") {
        setState({
          phase: "error",
          errorCode: "VALIDATION_FAILED",
          errorMessage: "No legal forward transition from this STATUS",
          slug,
        });
        return;
      }
      const writeId = newWriteId();
      setState({
        phase: "in-flight",
        errorCode: null,
        errorMessage: null,
        slug,
      });
      try {
        await mutation.mutateAsync({ slug, status: next, writeId });
        // STATUS is server-authoritative — stay in-flight until snapshot/echo.
        setState({
          phase: "idle",
          errorCode: null,
          errorMessage: null,
          slug,
        });
      } catch (err) {
        if (err instanceof ApiError) {
          setState({
            phase: "error",
            errorCode: err.code,
            errorMessage: err.message,
            slug,
          });
          return;
        }
        setState({
          phase: "error",
          errorCode: "INTERNAL",
          errorMessage: err instanceof Error ? err.message : "Transition failed",
          slug,
        });
      }
    },
    [mutation],
  );

  const reset = useCallback(() => setState(idle), []);

  return {
    state,
    transition,
    reset,
    legalNext,
    isPending: mutation.isPending,
  };
}

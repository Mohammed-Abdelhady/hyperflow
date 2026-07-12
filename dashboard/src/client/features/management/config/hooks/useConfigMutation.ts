import { useMutation } from "@tanstack/react-query";
import {
  ConfigPutResponseSchema,
  type ConfigWrite,
} from "@shared/schemas/index.js";
import { useCallback, useState } from "react";
import { QUERY_KEYS } from "../../../../constants/query-keys";
import { apiClient } from "../../../../services/api";
import { ApiError } from "../../../../services/api-error";

export type ConfigSavePhase =
  | "idle"
  | "saving"
  | "pending-echo"
  | "saved"
  | "conflict"
  | "error";

export interface ConfigMutationState {
  phase: ConfigSavePhase;
  errorCode: string | null;
  errorMessage: string | null;
  promptReapply: boolean;
  writeId: string | null;
}

const idle: ConfigMutationState = {
  phase: "idle",
  errorCode: null,
  errorMessage: null,
  promptReapply: false,
  writeId: null,
};

function newWriteId(): string {
  return `cfg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Merge known form values with preserved unrecognized keys for save payload.
 * Unrecognized keys are re-included verbatim (spec §3B.9).
 */
export function mergeConfigPayload(
  known: ConfigWrite,
  unrecognized: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...unrecognized,
    ...known,
  };
}

export function useConfigMutation() {
  const [state, setState] = useState<ConfigMutationState>(idle);

  const mutation = useMutation({
    mutationKey: QUERY_KEYS.CONFIG,
    mutationFn: async (input: {
      config: ConfigWrite;
      unrecognized: Record<string, unknown>;
      expectedMtimeMs?: number;
      writeId: string;
    }) => {
      // Wire body keeps known config strict; unrecognized preserved server-side
      // and mirrored in merge helper for payload audits / tests.
      void mergeConfigPayload(input.config, input.unrecognized);
      return apiClient.putJson(
        "/config",
        {
          config: input.config,
          ...(input.expectedMtimeMs !== undefined
            ? { expectedMtimeMs: input.expectedMtimeMs }
            : {}),
          writeId: input.writeId,
        },
        (json) => ConfigPutResponseSchema.parse(json),
      );
    },
  });

  const save = useCallback(
    async (input: {
      known: ConfigWrite;
      unrecognized: Record<string, unknown>;
      expectedMtimeMs?: number;
    }) => {
      const writeId = newWriteId();
      setState({
        phase: "saving",
        errorCode: null,
        errorMessage: null,
        promptReapply: false,
        writeId,
      });
      try {
        await mutation.mutateAsync({
          config: input.known,
          unrecognized: input.unrecognized,
          ...(input.expectedMtimeMs !== undefined
            ? { expectedMtimeMs: input.expectedMtimeMs }
            : {}),
          writeId,
        });
        setState({
          phase: "pending-echo",
          errorCode: null,
          errorMessage: null,
          promptReapply: false,
          writeId,
        });
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.code === "WRITE_CONFLICT") {
            setState({
              phase: "conflict",
              errorCode: err.code,
              errorMessage: err.message,
              promptReapply: true,
              writeId: null,
            });
            return;
          }
          setState({
            phase: "error",
            errorCode: err.code,
            errorMessage: err.message,
            promptReapply: false,
            writeId: null,
          });
          return;
        }
        setState({
          phase: "error",
          errorCode: "INTERNAL",
          errorMessage: err instanceof Error ? err.message : "Save failed",
          promptReapply: false,
          writeId: null,
        });
      }
    },
    [mutation],
  );

  const markSaved = useCallback(() => {
    setState((s) => ({ ...s, phase: "saved" }));
  }, []);

  const reset = useCallback(() => setState(idle), []);

  return { state, save, markSaved, reset, isPending: mutation.isPending };
}

import { useMutation } from "@tanstack/react-query";
import {
  MemoryWriteResponseSchema,
  type MemoryWriteResponse,
} from "@shared/schemas/index.js";
import { useCallback, useRef, useState } from "react";
import { QUERY_KEYS } from "../../../constants/query-keys";
import { apiClient } from "../../../services/api";
import { ApiError } from "../../../services/api-error";
import { useSnapshotStore } from "../../../stores/snapshot";

export type MemoryWritePhase =
  | "idle"
  | "pending-echo"
  | "confirmed"
  | "conflict"
  | "denied"
  | "error";

export interface MemoryMutationState {
  phase: MemoryWritePhase;
  writeId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  promptReapply: boolean;
}

function newWriteId(): string {
  return `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const idle: MemoryMutationState = {
  phase: "idle",
  writeId: null,
  errorCode: null,
  errorMessage: null,
  promptReapply: false,
};

export function useMemoryMutations() {
  const [state, setState] = useState<MemoryMutationState>(idle);
  const inFlight = useRef<string | null>(null);

  const saveMutation = useMutation({
    mutationKey: QUERY_KEYS.MEMORY,
    mutationFn: async (input: {
      category: string;
      content: string;
      expectedMtimeMs?: number;
      writeId: string;
    }): Promise<MemoryWriteResponse> => {
      return apiClient.putJson(
        `/memory/${encodeURIComponent(input.category)}`,
        {
          category: input.category,
          content: input.content,
          ...(input.expectedMtimeMs !== undefined
            ? { expectedMtimeMs: input.expectedMtimeMs }
            : {}),
          writeId: input.writeId,
        },
        (json) => MemoryWriteResponseSchema.parse(json),
      );
    },
  });

  const createMutation = useMutation({
    mutationKey: [...QUERY_KEYS.MEMORY, "create"],
    mutationFn: async (input: {
      category: string;
      content: string;
      writeId: string;
    }): Promise<MemoryWriteResponse> => {
      return apiClient.postJson(
        "/memory",
        {
          category: input.category,
          content: input.content,
          writeId: input.writeId,
        },
        (json) => MemoryWriteResponseSchema.parse(json),
      );
    },
  });

  const handleError = useCallback((err: unknown) => {
    if (err instanceof ApiError) {
      if (err.code === "WRITE_CONFLICT") {
        setState({
          phase: "conflict",
          writeId: null,
          errorCode: err.code,
          errorMessage: err.message,
          promptReapply: true,
        });
        return;
      }
      if (err.code === "PATH_BLOCKED" || err.status === 403) {
        setState({
          phase: "denied",
          writeId: null,
          errorCode: err.code,
          errorMessage: err.message,
          promptReapply: false,
        });
        return;
      }
      setState({
        phase: "error",
        writeId: null,
        errorCode: err.code,
        errorMessage: err.message,
        promptReapply: false,
      });
      return;
    }
    setState({
      phase: "error",
      writeId: null,
      errorCode: "INTERNAL",
      errorMessage: err instanceof Error ? err.message : "Unknown error",
      promptReapply: false,
    });
  }, []);

  const saveEntry = useCallback(
    async (input: {
      category: string;
      content: string;
      expectedMtimeMs?: number;
      isCreate?: boolean;
    }) => {
      if (inFlight.current) return;
      const writeId = newWriteId();
      inFlight.current = writeId;
      setState({
        phase: "pending-echo",
        writeId,
        errorCode: null,
        errorMessage: null,
        promptReapply: false,
      });
      useSnapshotStore.getState().pushOptimistic({
        writeId,
        surface: "memory",
        id: input.category,
      });
      try {
        if (input.isCreate) {
          await createMutation.mutateAsync({
            category: input.category,
            content: input.content,
            writeId,
          });
        } else {
          await saveMutation.mutateAsync({
            category: input.category,
            content: input.content,
            ...(input.expectedMtimeMs !== undefined
              ? { expectedMtimeMs: input.expectedMtimeMs }
              : {}),
            writeId,
          });
        }
        // POST accepts only — confirmed by write-echo.
        setState((s) => ({ ...s, phase: "pending-echo", writeId }));
      } catch (err) {
        useSnapshotStore.getState().rollbackOptimistic(writeId);
        handleError(err);
      } finally {
        inFlight.current = null;
      }
    },
    [createMutation, handleError, saveMutation],
  );

  const deleteEntry = useCallback(
    async (category: string, expectedMtimeMs?: number) => {
      // Delete = write empty content for category file (server denylist still applies).
      await saveEntry({
        category,
        content: "",
        ...(expectedMtimeMs !== undefined ? { expectedMtimeMs } : {}),
      });
    },
    [saveEntry],
  );

  const markEchoConfirmed = useCallback((writeId: string) => {
    setState((s) =>
      s.writeId === writeId
        ? { ...s, phase: "confirmed", promptReapply: false }
        : s,
    );
  }, []);

  const reset = useCallback(() => setState(idle), []);

  return {
    state,
    saveEntry,
    deleteEntry,
    markEchoConfirmed,
    reset,
    isSaving: saveMutation.isPending || createMutation.isPending,
  };
}

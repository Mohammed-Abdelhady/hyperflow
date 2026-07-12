import { useMutation } from "@tanstack/react-query";
import {
  WriteAcceptedResponseSchema,
  type Markers,
} from "@shared/schemas/index.js";
import { useCallback, useRef, useState } from "react";
import { QUERY_KEYS } from "../../../constants/query-keys";
import { apiClient } from "../../../services/api";
import { ApiError } from "../../../services/api-error";
import { useSnapshotStore } from "../../../stores/snapshot";

export type MarkerPhase =
  | "idle"
  | "pending-echo"
  | "confirmed"
  | "error";

export interface MarkerMutationState {
  phase: MarkerPhase;
  errorCode: string | null;
  errorMessage: string | null;
  writeId: string | null;
}

const idle: MarkerMutationState = {
  phase: "idle",
  errorCode: null,
  errorMessage: null,
  writeId: null,
};

function newWriteId(): string {
  return `mk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useMarkerMutations() {
  const [state, setState] = useState<MarkerMutationState>(idle);
  const inFlight = useRef(false);

  const mutation = useMutation({
    mutationKey: QUERY_KEYS.MARKERS,
    mutationFn: async (input: {
      mode?: string | null;
      sticky?: boolean;
      writeId: string;
    }) => {
      return apiClient.postJson(
        "/markers",
        {
          ...(input.mode !== undefined ? { mode: input.mode } : {}),
          ...(input.sticky !== undefined ? { sticky: input.sticky } : {}),
          writeId: input.writeId,
        },
        (json) => WriteAcceptedResponseSchema.parse(json),
      );
    },
  });

  const toggle = useCallback(
    async (patch: Partial<Pick<Markers, "mode" | "sticky">>) => {
      if (inFlight.current) return;
      inFlight.current = true;
      const writeId = newWriteId();
      setState({
        phase: "pending-echo",
        errorCode: null,
        errorMessage: null,
        writeId,
      });
      useSnapshotStore.getState().pushOptimistic({
        writeId,
        surface: "markers",
        id: "markers",
      });
      // Optimistic patch on markers slice
      const data = useSnapshotStore.getState().data;
      if (data) {
        useSnapshotStore.setState({
          data: {
            ...data,
            markers: { ...data.markers, ...patch },
          },
        });
      }
      try {
        await mutation.mutateAsync({
          ...(patch.mode !== undefined ? { mode: patch.mode } : {}),
          ...(patch.sticky !== undefined ? { sticky: patch.sticky } : {}),
          writeId,
        });
        setState({
          phase: "pending-echo",
          errorCode: null,
          errorMessage: null,
          writeId,
        });
      } catch (err) {
        useSnapshotStore.getState().rollbackOptimistic(writeId);
        if (data) {
          useSnapshotStore.setState({ data });
        }
        if (err instanceof ApiError) {
          setState({
            phase: "error",
            errorCode: err.code,
            errorMessage: err.message,
            writeId: null,
          });
        } else {
          setState({
            phase: "error",
            errorCode: "INTERNAL",
            errorMessage: err instanceof Error ? err.message : "Toggle failed",
            writeId: null,
          });
        }
      } finally {
        inFlight.current = false;
      }
    },
    [mutation],
  );

  const reset = useCallback(() => setState(idle), []);

  return { state, toggle, reset, isPending: mutation.isPending };
}

import { useMutation } from "@tanstack/react-query";
import { WriteAcceptedResponseSchema } from "@shared/schemas/index.js";
import { useCallback, useState } from "react";
import { apiClient } from "../../../services/api";
import { ApiError } from "../../../services/api-error";

export interface BackupInfo {
  id: string;
  path: string;
  targetRel: string;
  mtimeMs?: number;
}

export type RestorePhase = "idle" | "restoring" | "pending-echo" | "error";

export interface RestoreState {
  phase: RestorePhase;
  errorCode: string | null;
  errorMessage: string | null;
  promptReapply: boolean;
}

const idle: RestoreState = {
  phase: "idle",
  errorCode: null,
  errorMessage: null,
  promptReapply: false,
};

function newWriteId(): string {
  return `rs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function fetchBackups(target?: string): Promise<BackupInfo[]> {
  const { readSessionToken } = await import("../../../utils/handshake");
  const { HYPERFLOW_TOKEN_HEADER } = await import("@shared/schemas/index.js");
  const token = readSessionToken();
  const headers = new Headers();
  if (token) headers.set(HYPERFLOW_TOKEN_HEADER, token);
  const q = target ? `?target=${encodeURIComponent(target)}` : "";
  const res = await fetch(`/api/v1/restore${q}`, { headers });
  const json: unknown = await res.json();
  if (!res.ok) throw new Error("backup list failed");
  if (
    typeof json === "object" &&
    json !== null &&
    "backups" in json &&
    Array.isArray((json as { backups: unknown }).backups)
  ) {
    return (json as { backups: BackupInfo[] }).backups;
  }
  return [];
}

export function useRestoreMutation() {
  const [state, setState] = useState<RestoreState>(idle);

  const mutation = useMutation({
    mutationFn: async (input: {
      backupId: string;
      targetPath: string;
      expectedMtimeMs?: number;
      writeId: string;
    }) => {
      return apiClient.postJson(
        "/restore",
        input,
        (json) => WriteAcceptedResponseSchema.parse(json),
      );
    },
  });

  const restore = useCallback(
    async (input: {
      backupId: string;
      targetPath: string;
      expectedMtimeMs?: number;
    }) => {
      const writeId = newWriteId();
      setState({
        phase: "restoring",
        errorCode: null,
        errorMessage: null,
        promptReapply: false,
      });
      try {
        await mutation.mutateAsync({ ...input, writeId });
        setState({
          phase: "pending-echo",
          errorCode: null,
          errorMessage: null,
          promptReapply: false,
        });
      } catch (err) {
        if (err instanceof ApiError) {
          setState({
            phase: "error",
            errorCode: err.code,
            errorMessage: err.message,
            promptReapply: err.code === "WRITE_CONFLICT",
          });
          return;
        }
        setState({
          phase: "error",
          errorCode: "INTERNAL",
          errorMessage: err instanceof Error ? err.message : "Restore failed",
          promptReapply: false,
        });
      }
    },
    [mutation],
  );

  const reset = useCallback(() => setState(idle), []);

  return { state, restore, reset, isPending: mutation.isPending };
}

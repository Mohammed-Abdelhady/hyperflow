import { memo, useEffect, useState } from "react";
import { EmptyState } from "../../../components/EmptyState";
import { formatDateTime } from "../../../utils/format";
import { InlineConfirm } from "../../memory/components/InlineConfirm";
import { useObserveMode } from "../hooks/useObserveMode";
import {
  fetchBackups,
  useRestoreMutation,
  type BackupInfo,
} from "./useRestoreMutation";

function RestorePanelImpl() {
  const { observeMode, tooltip } = useObserveMode();
  const { state, restore, isPending } = useRestoreMutation();
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchBackups()
      .then((list) => {
        if (!cancelled) setBackups(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="hf-mgmt-section" data-testid="restore-panel">
      <h2 className="hf-doc__title">Restore</h2>
      <p className="hf-replay__note">
        Reinstate a pre-write backup through the conflict-checked write path.
      </p>
      {loadError ? (
        <p className="hf-error-inline" data-testid="restore-load-error">
          {loadError}
        </p>
      ) : null}
      {state.errorMessage ? (
        <p className="hf-error-inline" data-testid="restore-error">
          [{state.errorCode}] {state.errorMessage}
          {state.promptReapply ? " — refresh and reapply." : ""}
        </p>
      ) : null}
      {backups.length === 0 && !loadError ? (
        <EmptyState
          fact="No session backups yet. Backups appear after management writes."
          testId="restore-empty"
        />
      ) : (
        <ul className="hf-conclusions__list" data-testid="restore-list">
          {backups.map((b) => (
            <li
              key={b.id}
              className="hf-conclusions__item"
              data-testid={`restore-item-${b.id}`}
            >
              <div>
                <strong>{b.targetRel}</strong>
                <span className="hf-roster-row__meta">
                  {b.mtimeMs !== undefined ? formatDateTime(b.mtimeMs) : b.id}
                </span>
              </div>
              {confirmId === b.id ? (
                <InlineConfirm
                  label="BLOCKED — restore overwrites current on-disk state"
                  confirmLabel="Restore"
                  onConfirm={() => {
                    void restore({
                      backupId: b.id,
                      targetPath: b.targetRel,
                      ...(b.mtimeMs !== undefined
                        ? { expectedMtimeMs: b.mtimeMs }
                        : {}),
                    });
                    setConfirmId(null);
                  }}
                  onCancel={() => setConfirmId(null)}
                  testId={`restore-confirm-${b.id}`}
                />
              ) : (
                <button
                  type="button"
                  className="hf-btn hf-btn--danger"
                  data-testid={`restore-action-${b.id}`}
                  disabled={observeMode || isPending}
                  title={tooltip ?? "Restore backup"}
                  onClick={() => setConfirmId(b.id)}
                >
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const RestorePanel = memo(RestorePanelImpl);

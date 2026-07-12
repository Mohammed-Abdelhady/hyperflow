import { memo } from "react";
import { useSnapshotSlice } from "../../../hooks/use-slice";
import { selectMarkers } from "../../../utils/selectors";
import { useObserveMode } from "../hooks/useObserveMode";
import { useMarkerMutations } from "./useMarkerMutations";

function MarkerPanelImpl() {
  const markers = useSnapshotSlice((s) => selectMarkers(s.data));
  const { observeMode, tooltip } = useObserveMode();
  const { state, toggle, isPending } = useMarkerMutations();

  const mode = markers?.mode ?? null;
  const sticky = markers?.sticky ?? false;
  const disabled = observeMode || isPending || state.phase === "pending-echo";

  return (
    <div className="hf-mgmt-section" data-testid="marker-panel">
      <h2 className="hf-doc__title">Markers</h2>
      <p className="hf-replay__note">
        `.mode` and `.sticky` control chain behavior between runs. Absent files
        show defaults; first toggle creates them.
      </p>
      {state.errorMessage ? (
        <p className="hf-error-inline" data-testid="marker-panel-error">
          [{state.errorCode}] {state.errorMessage}
        </p>
      ) : null}
      {state.phase === "pending-echo" ? (
        <span className="hf-pending" data-testid="marker-panel-pending">
          Awaiting write-echo…
        </span>
      ) : null}
      <label className="hf-field">
        <span className="hf-field__label">Mode</span>
        <input
          className="hf-field__input"
          value={mode ?? ""}
          disabled={disabled}
          data-testid="marker-mode-input"
          title={tooltip ?? "Chain mode marker"}
          onChange={(e) => {
            const v = e.target.value.trim();
            void toggle({ mode: v === "" ? null : v });
          }}
          placeholder="(default)"
        />
        <span className="hf-replay__note">
          Sets `.mode` — e.g. auto / manual chain routing.
        </span>
      </label>
      <label className="hf-field">
        <span className="hf-field__label">Sticky</span>
        <input
          type="checkbox"
          className="hf-roster-row__check"
          checked={sticky}
          disabled={disabled}
          data-testid="marker-sticky-toggle"
          title={tooltip ?? "Sticky marker"}
          onChange={(e) => void toggle({ sticky: e.target.checked })}
        />
        <span className="hf-replay__note">
          When set, sticky keeps the active mode across sessions.
        </span>
      </label>
    </div>
  );
}

export const MarkerPanel = memo(MarkerPanelImpl);

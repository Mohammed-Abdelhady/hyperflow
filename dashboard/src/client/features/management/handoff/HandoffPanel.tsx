import { memo, useMemo } from "react";
import { isRawEntry } from "@shared/derived/parse-nodes.js";
import type { HandoffPackage, HandoffStatus } from "@shared/schemas/index.js";
import { EmptyState } from "../../../components/EmptyState";
import { StatusBadge } from "../../../components/StatusBadge";
import { useSnapshotSlice } from "../../../hooks/use-slice";
import { selectHandoff } from "../../../utils/selectors";
import { useObserveMode } from "../hooks/useObserveMode";
import { HandoffTransition } from "./HandoffTransition";
import { useHandoffMutations } from "./useHandoffMutations";

function HandoffPanelImpl() {
  const handoff = useSnapshotSlice((s) => selectHandoff(s.data));
  const { observeMode, tooltip } = useObserveMode();
  const { state, transition, isPending } = useHandoffMutations();

  const packages = useMemo(() => {
    const list: HandoffPackage[] = [];
    for (const entry of handoff) {
      if (!isRawEntry(entry)) list.push(entry as HandoffPackage);
    }
    return list;
  }, [handoff]);

  if (packages.length === 0) {
    return (
      <div className="hf-mgmt-section" data-testid="handoff-panel">
        <h2 className="hf-doc__title">Handoff</h2>
        <EmptyState
          fact="No handoff packages. Create a two-session handoff under .hyperflow-handoff/."
          testId="handoff-empty"
        />
      </div>
    );
  }

  return (
    <div className="hf-mgmt-section" data-testid="handoff-panel">
      <h2 className="hf-doc__title">Handoff</h2>
      <ul className="hf-conclusions__list" data-testid="handoff-list">
        {packages.map((pkg) => {
          const status = pkg.status as HandoffStatus;
          const activeError =
            state.slug === pkg.slug && state.phase === "error"
              ? state
              : { errorCode: null, errorMessage: null };
          return (
            <li
              key={pkg.slug}
              className="hf-conclusions__item"
              data-testid={`handoff-item-${pkg.slug}`}
            >
              <div
                style={{
                  display: "flex",
                  gap: "var(--sp-2)",
                  alignItems: "center",
                }}
              >
                <strong data-testid={`handoff-slug-${pkg.slug}`}>{pkg.slug}</strong>
                <StatusBadge
                  verdict={status.toUpperCase()}
                  testId={`handoff-status-${pkg.slug}`}
                />
              </div>
              {pkg.tldr ? (
                <p className="hf-doc__tldr">{pkg.tldr}</p>
              ) : null}
              <HandoffTransition
                slug={pkg.slug}
                status={status}
                disabled={observeMode}
                disabledTitle={tooltip}
                inFlight={
                  isPending && state.slug === pkg.slug && state.phase === "in-flight"
                }
                errorCode={activeError.errorCode}
                errorMessage={activeError.errorMessage}
                onTransition={(slug, cur) => void transition(slug, cur)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const HandoffPanel = memo(HandoffPanelImpl);

import { memo, useEffect } from "react";
import { Chainline } from "../../../components/Chainline";
import type { ChainStage } from "../../../utils/chainline-geometry";
import type { TimelineIndex } from "../hooks/timeline-index";
import type { ScrubInteraction } from "../hooks/use-scrub-interaction";

export interface ScrubHeaderProps {
  index: TimelineIndex;
  scrub: ScrubInteraction;
  stages: readonly ChainStage[];
  stale?: boolean;
  testId?: string;
}

function ScrubHeaderImpl({
  index,
  scrub,
  stages,
  stale = false,
  testId = "replay-scrub",
}: ScrubHeaderProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Home") {
        e.preventDefault();
        scrub.jumpStart();
      } else if (e.key === "End") {
        e.preventDefault();
        scrub.jumpEnd();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scrub]);

  return (
    <header className="hf-replay__scrub" data-testid={testId}>
      {stale ? (
        <p className="hf-replay__stale" data-testid={`${testId}-stale`}>
          Loading range — showing last-good state
        </p>
      ) : null}
      {index.degraded ? (
        <p className="hf-replay__note" data-testid={`${testId}-degraded`}>
          events.ndjson absent or empty. Replay requires recorded events;
          markdown-only mode has reduced fidelity.
        </p>
      ) : null}
      {index.singleEvent ? (
        <p className="hf-replay__note" data-testid={`${testId}-single`}>
          One event recorded. Replay becomes meaningful with more events.
        </p>
      ) : null}
      <div
        data-testid={`${testId}-chainline`}
        aria-disabled={!index.scrubEnabled ? true : undefined}
        style={
          index.scrubEnabled
            ? undefined
            : { pointerEvents: "none", opacity: 0.55 }
        }
      >
        <Chainline
          mode="scrub"
          stages={stages}
          position={scrub.position}
          eventCount={index.eventCount}
          {...(index.scrubEnabled
            ? {
                onPositionChange: scrub.setPosition,
                onScrubbingChange: scrub.setScrubbing,
              }
            : {})}
          testId={`${testId}-line`}
        />
      </div>
    </header>
  );
}

export const ScrubHeader = memo(ScrubHeaderImpl);

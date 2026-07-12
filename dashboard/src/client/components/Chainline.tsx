import { memo } from "react";
import {
  liveFillScale,
  type ChainStage,
} from "../utils/chainline-geometry";
import { Scrubber } from "./Scrubber";

export type ChainlineMode = "live" | "scrub" | "record";

export interface ChainlineProps {
  mode: ChainlineMode;
  stages: readonly ChainStage[];
  /** Live: current stage index. */
  activeIndex?: number;
  /** Scrub: normalized position 0..1. */
  position?: number;
  eventCount?: number;
  onStageSelect?: (stageId: string) => void;
  onPositionChange?: (position: number) => void;
  onScrubbingChange?: (scrubbing: boolean) => void;
  testId?: string;
}

function ChainlineImpl({
  mode,
  stages,
  activeIndex = 0,
  position = 0,
  eventCount = 0,
  onStageSelect,
  onPositionChange,
  onScrubbingChange,
  testId = "chainline",
}: ChainlineProps) {
  const fill =
    mode === "scrub"
      ? position
      : liveFillScale(stages, activeIndex);

  if (mode === "scrub") {
    return (
      <div className="hf-chainline" data-testid={testId} data-mode="scrub">
        <Scrubber
          position={position}
          eventCount={eventCount}
          stageCount={stages.length}
          onPositionChange={onPositionChange}
          onScrubbingChange={onScrubbingChange}
          testId={`${testId}-scrubber`}
        />
        <div className="hf-chainline__stages">
          {stages.map((stage) => (
            <div key={stage.id} className="hf-chainline__stage">
              <span className="hf-chainline__label">{stage.label}</span>
              {stage.costLabel !== undefined ? (
                <span className="hf-chainline__cost">{stage.costLabel}</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const interactive = mode === "record";

  return (
    <div className="hf-chainline" data-testid={testId} data-mode={mode}>
      <div className="hf-chainline__rail" data-testid={`${testId}-rail`}>
        <div
          className="hf-chainline__fill"
          data-testid={`${testId}-fill`}
          style={{ transform: `scaleX(${fill})` }}
        />
      </div>
      <div className="hf-chainline__stages">
        {stages.map((stage) => {
          const body = (
            <>
              <span className="hf-chainline__label">{stage.label}</span>
              {stage.costLabel !== undefined ? (
                <span className="hf-chainline__cost">{stage.costLabel}</span>
              ) : null}
            </>
          );
          if (interactive) {
            return (
              <button
                key={stage.id}
                type="button"
                className="hf-chainline__stage hf-chainline__stage--interactive"
                data-testid={`${testId}-stage-${stage.id}`}
                onClick={() => onStageSelect?.(stage.id)}
              >
                {body}
              </button>
            );
          }
          return (
            <div
              key={stage.id}
              className="hf-chainline__stage"
              data-testid={`${testId}-stage-${stage.id}`}
            >
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const Chainline = memo(ChainlineImpl);
export type { ChainStage };

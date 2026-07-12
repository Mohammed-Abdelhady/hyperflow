import { memo } from "react";
import { Chainline } from "../../../components/Chainline";
import type { ChainStage } from "../../../utils/chainline-geometry";

export interface BoardHeaderProps {
  stages: readonly ChainStage[];
  activeIndex: number;
  testId?: string;
}

function BoardHeaderImpl({
  stages,
  activeIndex,
  testId = "mission-chainline",
}: BoardHeaderProps) {
  if (stages.length === 0) {
    return (
      <header className="hf-cockpit__header" data-testid={testId}>
        <Chainline mode="live" stages={[]} activeIndex={0} testId={testId} />
      </header>
    );
  }
  return (
    <header className="hf-cockpit__header" data-testid={`${testId}-wrap`}>
      <Chainline
        mode="live"
        stages={stages}
        activeIndex={activeIndex}
        testId={testId}
      />
    </header>
  );
}

export const BoardHeader = memo(BoardHeaderImpl);

import { EmptyState } from "../../components/EmptyState";
import { BoardHeader } from "./components/BoardHeader";
import { BottomStreamSlot } from "./components/BottomStreamSlot";
import { DispatchBoard } from "./components/DispatchBoard";
import { InspectorShell } from "./components/InspectorShell";
import { useBoardSelection } from "./hooks/use-board-selection";
import { useMissionRoster } from "./hooks/use-mission-roster";

export function MissionControlPage() {
  const { agents, empty, stages, activeStageIndex } = useMissionRoster();
  const { selectedId, select } = useBoardSelection();
  const selected = agents.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="hf-cockpit" data-testid="surface-mission">
      <BoardHeader stages={stages} activeIndex={activeStageIndex} />
      {empty ? (
        <section
          className="hf-cockpit__board"
          data-testid="mission-zero"
          style={{ gridColumn: "1 / -1" }}
        >
          <EmptyState
            fact="No chains recorded. Run /hyperflow:plan in this project to populate."
            testId="mission-empty"
          />
          <div className="hf-cockpit" style={{ minHeight: 200 }}>
            <DispatchBoard agents={[]} selectedId={null} onSelect={select} />
            <InspectorShell agent={null} />
            <BottomStreamSlot />
          </div>
        </section>
      ) : (
        <>
          <DispatchBoard
            agents={agents}
            selectedId={selectedId}
            onSelect={select}
          />
          <InspectorShell agent={selected} />
          <BottomStreamSlot />
        </>
      )}
    </div>
  );
}

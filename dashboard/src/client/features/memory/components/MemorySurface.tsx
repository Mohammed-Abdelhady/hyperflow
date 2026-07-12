import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../../../components/EmptyState";
import { BrowserSplit } from "../../plans/components/BrowserSplit";
import { usePlanSelection } from "../../plans/hooks/usePlanSelection";
import { useMemoryMutations } from "../hooks/useMemoryMutations";
import { useMemorySlice } from "../hooks/useMemorySlice";
import { EntryEditor } from "./EntryEditor";
import { EntryView } from "./EntryView";
import { InlineConfirm } from "./InlineConfirm";
import { KnowledgeGraph } from "./KnowledgeGraph";
import { MemoryRail } from "./MemoryRail";

type Mode = "view" | "edit" | "create" | "graph";

export function MemorySurface() {
  const { entries, byId, graph, empty, observeMode } = useMemorySlice();
  const ids = useMemo(() => entries.map((e) => e.id), [entries]);
  const { selectedSlug: selectedId, select } = usePlanSelection({ slugs: ids });
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const mutations = useMemoryMutations();
  const [mode, setMode] = useState<Mode>("view");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (mutations.state.phase === "confirmed") {
      setMode("view");
      setConfirmDelete(false);
    }
  }, [mutations.state.phase]);

  if (empty && mode !== "create") {
    return (
      <div data-testid="surface-memory">
        {observeMode ? (
          <EmptyState
            fact="No memory entries yet. Capture decisions under .hyperflow/memory/."
            testId="memory-empty"
          />
        ) : (
          <EmptyState
            fact="No memory entries yet. Capture decisions under .hyperflow/memory/."
            actionLabel="Create entry"
            onAction={() => setMode("create")}
            testId="memory-empty"
          />
        )}
      </div>
    );
  }

  return (
    <div data-testid="surface-memory" style={{ height: "100%" }}>
      <BrowserSplit
        testId="memory-split"
        rail={
          <MemoryRail
            entries={entries}
            selectedId={selectedId}
            onSelect={(id) => {
              select(id);
              setMode("view");
              setConfirmDelete(false);
            }}
            onCreate={() => setMode("create")}
            observeMode={observeMode}
          />
        }
        header={
          <div className="hf-diff__controls">
            <button
              type="button"
              className="hf-btn"
              data-testid="memory-view-list"
              onClick={() => setMode("view")}
            >
              List
            </button>
            <button
              type="button"
              className="hf-btn"
              data-testid="memory-view-graph"
              onClick={() => setMode("graph")}
            >
              Graph
            </button>
          </div>
        }
        pane={
          <>
            {mode === "graph" ? (
              <KnowledgeGraph
                model={graph}
                selectedId={selectedId}
                onSelect={(id) => {
                  if (id) {
                    select(id);
                    setMode("view");
                  }
                }}
              />
            ) : null}
            {mode === "create" ? (
              <EntryEditor
                category=""
                content=""
                isCreate
                phase={mutations.state.phase}
                observeMode={observeMode}
                errorMessage={mutations.state.errorMessage}
                onSave={(category, content) =>
                  void mutations.saveEntry({ category, content, isCreate: true })
                }
                onCancel={() => setMode("view")}
              />
            ) : null}
            {mode === "edit" && selected ? (
              <EntryEditor
                category={selected.category}
                content={
                  selected.entry.rawBody ??
                  [selected.entry.what, selected.entry.why]
                    .filter(Boolean)
                    .join("\n\n")
                }
                phase={mutations.state.phase}
                observeMode={observeMode}
                errorMessage={mutations.state.errorMessage}
                onSave={(category, content) =>
                  void mutations.saveEntry({
                    category,
                    content,
                    ...(selected.mtimeMs !== undefined
                      ? { expectedMtimeMs: selected.mtimeMs }
                      : {}),
                  })
                }
                onCancel={() => setMode("view")}
              />
            ) : null}
            {mode === "view" ? (
              <>
                <EntryView
                  entry={selected}
                  observeMode={observeMode}
                  onEdit={() => setMode("edit")}
                  onDeleteRequest={() => setConfirmDelete(true)}
                />
                {confirmDelete && selected ? (
                  <InlineConfirm
                    label="BLOCKED — permanently delete this entry?"
                    onConfirm={() => {
                      void mutations.deleteEntry(
                        selected.category,
                        selected.mtimeMs,
                      );
                      setConfirmDelete(false);
                    }}
                    onCancel={() => setConfirmDelete(false)}
                  />
                ) : null}
                {mutations.state.promptReapply ? (
                  <p className="hf-error-inline" data-testid="memory-conflict">
                    Write conflict — on-disk version refreshed. Reapply your
                    edit.
                  </p>
                ) : null}
              </>
            ) : null}
          </>
        }
      />
    </div>
  );
}

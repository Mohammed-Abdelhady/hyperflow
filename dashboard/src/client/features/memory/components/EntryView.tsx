import { memo } from "react";
import { EmptyState } from "../../../components/EmptyState";
import type { MemoryEntryView } from "../utils/graph-model";

export interface EntryViewProps {
  entry: MemoryEntryView | null;
  observeMode: boolean;
  onEdit?: () => void;
  onDeleteRequest?: () => void;
  testId?: string;
}

function EntryViewImpl({
  entry,
  observeMode,
  onEdit,
  onDeleteRequest,
  testId = "entry-view",
}: EntryViewProps) {
  if (!entry) {
    return (
      <EmptyState
        fact="Select a memory entry from the rail."
        testId={`${testId}-empty`}
      />
    );
  }

  const writable = !entry.derived && !observeMode && !entry.legacy;

  return (
    <article className="hf-doc" data-testid={testId}>
      {entry.derived ? (
        <span className="hf-doc__badge" data-testid={`${testId}-derived`}>
          Derived — read-only
        </span>
      ) : null}
      {entry.legacy ? (
        <span className="hf-doc__badge" data-testid={`${testId}-legacy`}>
          Legacy / raw
        </span>
      ) : null}
      <h2 className="hf-doc__title" data-testid={`${testId}-title`}>
        {entry.title}
      </h2>
      <p className="hf-replay__note" data-testid={`${testId}-category`}>
        Category: {entry.category}
      </p>
      {entry.entry.what ? (
        <p className="hf-doc__tldr" data-testid={`${testId}-what`}>
          {entry.entry.what}
        </p>
      ) : null}
      {entry.entry.why ? (
        <p className="hf-doc__tldr" data-testid={`${testId}-why`}>
          {entry.entry.why}
        </p>
      ) : null}
      {entry.entry.rawBody ? (
        <pre className="hf-doc__raw" data-testid={`${testId}-raw`}>
          {entry.entry.rawBody}
        </pre>
      ) : null}
      {writable ? (
        <div className="hf-diff__controls">
          <button
            type="button"
            className="hf-btn"
            data-testid={`${testId}-edit`}
            onClick={onEdit}
            title={observeMode ? "Observe mode — writes disabled" : undefined}
          >
            Edit
          </button>
          <button
            type="button"
            className="hf-btn hf-btn--danger"
            data-testid={`${testId}-delete`}
            onClick={onDeleteRequest}
          >
            Delete
          </button>
        </div>
      ) : null}
    </article>
  );
}

export const EntryView = memo(EntryViewImpl);

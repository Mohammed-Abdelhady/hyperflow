import { memo, useState } from "react";
import type { MemoryWritePhase } from "../hooks/useMemoryMutations";

export interface EntryEditorProps {
  category: string;
  content: string;
  phase: MemoryWritePhase;
  observeMode: boolean;
  errorMessage: string | null;
  onSave: (category: string, content: string) => void;
  onCancel: () => void;
  isCreate?: boolean;
  testId?: string;
}

function EntryEditorImpl({
  category: initialCategory,
  content: initialContent,
  phase,
  observeMode,
  errorMessage,
  onSave,
  onCancel,
  isCreate = false,
  testId = "entry-editor",
}: EntryEditorProps) {
  const [category, setCategory] = useState(initialCategory);
  const [content, setContent] = useState(initialContent);
  const disabled = observeMode || phase === "pending-echo";

  return (
    <div className="hf-form-section" data-testid={testId}>
      <h3 className="hf-form-section__title">
        {isCreate ? "Create entry" : "Edit entry"}
      </h3>
      {phase === "pending-echo" ? (
        <span className="hf-pending" data-testid={`${testId}-pending`}>
          Awaiting write-echo confirmation…
        </span>
      ) : null}
      {phase === "confirmed" ? (
        <span className="hf-pending" data-testid={`${testId}-confirmed`}>
          Saved
        </span>
      ) : null}
      {errorMessage ? (
        <p className="hf-error-inline" data-testid={`${testId}-error`}>
          {errorMessage}
        </p>
      ) : null}
      <label className="hf-field">
        <span className="hf-field__label">Category</span>
        <input
          className="hf-field__input"
          value={category}
          disabled={disabled || !isCreate}
          data-testid={`${testId}-category`}
          onChange={(e) => setCategory(e.target.value)}
        />
      </label>
      <label className="hf-field">
        <span className="hf-field__label">Content</span>
        <textarea
          className="hf-field__textarea"
          rows={10}
          value={content}
          disabled={disabled}
          data-testid={`${testId}-content`}
          onChange={(e) => setContent(e.target.value)}
          title={observeMode ? "Observe mode — writes disabled" : undefined}
        />
      </label>
      <div className="hf-diff__controls">
        <button
          type="button"
          className="hf-btn hf-btn--primary"
          data-testid={`${testId}-save`}
          disabled={disabled || !category.trim()}
          title={observeMode ? "Observe mode — writes disabled" : undefined}
          onClick={() => onSave(category.trim(), content)}
        >
          Save
        </button>
        <button
          type="button"
          className="hf-btn"
          data-testid={`${testId}-cancel`}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export const EntryEditor = memo(EntryEditorImpl);

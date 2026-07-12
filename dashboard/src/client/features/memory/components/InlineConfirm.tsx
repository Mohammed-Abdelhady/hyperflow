import { memo } from "react";

export interface InlineConfirmProps {
  label: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}

function InlineConfirmImpl({
  label,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  testId = "inline-confirm",
}: InlineConfirmProps) {
  return (
    <div className="hf-inline-confirm" data-testid={testId} role="alertdialog">
      <span className="hf-inline-confirm__label" data-testid={`${testId}-label`}>
        {label}
      </span>
      <div className="hf-inline-confirm__actions">
        <button
          type="button"
          className="hf-btn hf-btn--danger"
          data-testid={`${testId}-confirm`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          className="hf-btn"
          data-testid={`${testId}-cancel`}
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}

export const InlineConfirm = memo(InlineConfirmImpl);
